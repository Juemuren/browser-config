import html2canvas from 'html2canvas'
import { createWorker, type Worker } from 'tesseract.js'
import { download, safeFilename } from '../shared'

const garbled = /[\uE000-\uF8FF]/u
let workerPromise: Promise<Worker> | undefined

interface TextTarget {
  node: Text
  start: number
  end: number
}

function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker(['chi_sim', 'eng']).catch((error) => {
    workerPromise = undefined
    throw error
  })
  return workerPromise
}

export async function stopWorker(): Promise<void> {
  const pending = workerPromise
  workerPromise = undefined
  if (pending) await (await pending).terminate()
}

function textNodes(root: Element): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    nodes.push(node)
  }
  return nodes
}

function ocrTargets(nodes: Text[], forceOcr: boolean): TextTarget[] {
  const targets: TextTarget[] = []
  for (const node of nodes) {
    const parent = node.parentElement
    const value = node.nodeValue || ''
    if (
      !parent ||
      parent.closest('script, style, noscript, textarea') ||
      !value.trim()
    )
      continue
    if (forceOcr) {
      targets.push({ node, start: 0, end: value.length })
    } else if (garbled.test(value)) {
      targets.push({ node, start: 0, end: value.length })
    }
  }
  return targets
}

function captureTarget(
  target: TextTarget,
  source: HTMLCanvasElement,
  parent: HTMLElement,
): HTMLCanvasElement {
  const range = document.createRange()
  range.setStart(target.node, target.start)
  range.setEnd(target.node, target.end)
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  )
  const parentRect = parent.getBoundingClientRect()
  if (!rects.length || !parentRect.width || !parentRect.height)
    throw new Error('文本区域不可见')

  const scaleX = source.width / parentRect.width
  const scaleY = source.height / parentRect.height
  const slices = rects
    .map((rect) => {
      const x = Math.max(0, Math.floor((rect.left - parentRect.left) * scaleX))
      const y = Math.max(0, Math.floor((rect.top - parentRect.top) * scaleY))
      return {
        x,
        y,
        width: Math.min(source.width - x, Math.ceil(rect.width * scaleX)),
        height: Math.min(source.height - y, Math.ceil(rect.height * scaleY)),
      }
    })
    .filter((slice) => slice.width > 0 && slice.height > 0)
  if (!slices.length) throw new Error('文本截图尺寸无效')

  const padding = 8
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(...slices.map((slice) => slice.width)) + padding * 2
  canvas.height = slices.reduce(
    (total, slice) => total + slice.height + padding,
    padding,
  )
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建文本截图')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  let top = padding
  for (const slice of slices) {
    context.drawImage(
      source,
      slice.x,
      slice.y,
      slice.width,
      slice.height,
      padding,
      top,
      slice.width,
      slice.height,
    )
    top += slice.height + padding
  }
  return canvas
}

function normalizedText(
  text: string,
  original: string,
  parent: Element,
): string {
  const whiteSpace = getComputedStyle(parent).whiteSpace
  const content = whiteSpace.startsWith('pre')
    ? text.trim()
    : text.replace(/\s+/g, ' ').trim()
  return `${original.match(/^\s*/)?.[0] || ''}${content}${original.match(/\s*$/)?.[0] || ''}`
}

function absoluteUrl(value: string): string {
  try {
    return new URL(value, location.href).href
  } catch {
    return value
  }
}

function cleanClone(root: Element): void {
  for (const element of root.querySelectorAll(
    'script, iframe, object, embed, meta[http-equiv], base',
  )) {
    element.remove()
  }
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attr of Array.from(element.attributes)) {
      if (
        /^on/i.test(attr.name) ||
        attr.name === 'action' ||
        attr.name === 'formaction'
      )
        element.removeAttribute(attr.name)
    }
    for (const name of ['href', 'src', 'poster']) {
      const value = element.getAttribute(name)
      if (!value) continue
      if (/^\s*(javascript|vbscript):/i.test(value))
        element.removeAttribute(name)
      else if (!/^\s*(data|blob|mailto|tel):/i.test(value))
        element.setAttribute(name, absoluteUrl(value))
    }
    const srcset = element.getAttribute('srcset')
    if (srcset)
      element.setAttribute(
        'srcset',
        srcset
          .split(',')
          .map((item) => {
            const parts = item.trim().split(/\s+/)
            return [absoluteUrl(parts[0]), ...parts.slice(1)].join(' ')
          })
          .join(', '),
      )
  }
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return value.replace(
    /[&<>"']/g,
    (character) => entities[character] ?? character,
  )
}

export async function exportElement(
  element: Element,
  update: (message: string) => void,
  forceOcr = false,
): Promise<{ recognized: number; failed: number }> {
  await document.fonts.ready
  const originals = textNodes(element)
  const targets = ocrTargets(originals, forceOcr)
  const clone = element.cloneNode(true) as Element
  const copies = textNodes(clone)
  const canvasCache = new Map<HTMLElement, Promise<HTMLCanvasElement>>()
  const replacements = new Map<
    Text,
    Array<{ start: number; end: number; text: string }>
  >()
  let recognized = 0
  let failed = 0
  for (const [index, target] of targets.entries()) {
    update(`OCR 识别 ${index + 1}/${targets.length}…`)
    try {
      const parent = target.node.parentElement
      if (!(parent instanceof HTMLElement))
        throw new Error('不支持识别非 HTML 文本节点')
      let captured = canvasCache.get(parent)
      if (!captured) {
        captured = html2canvas(parent, {
          scale: 2,
          backgroundColor: '#fff',
          useCORS: true,
          logging: false,
        })
        canvasCache.set(parent, captured)
      }
      const canvas = captureTarget(target, await captured, parent)
      const result = await (await getWorker()).recognize(canvas)
      const text = result.data.text.trim()
      if (!text) throw new Error('OCR 结果为空')
      const copy = copies[originals.indexOf(target.node)]
      if (!copy) throw new Error('找不到导出副本中的文本节点')
      const original =
        target.node.nodeValue?.slice(target.start, target.end) || ''
      const edits = replacements.get(target.node) || []
      edits.push({
        start: target.start,
        end: target.end,
        text: normalizedText(text, original, parent),
      })
      replacements.set(target.node, edits)
      recognized++
    } catch (error) {
      console.warn('[HTML 导出] OCR 失败，保留原文', error)
      failed++
    }
  }
  for (const [node, edits] of replacements) {
    const copy = copies[originals.indexOf(node)]
    if (!copy) continue
    let value = node.nodeValue || ''
    for (const edit of edits.sort((left, right) => right.start - left.start)) {
      value = value.slice(0, edit.start) + edit.text + value.slice(edit.end)
    }
    copy.nodeValue = value
  }
  cleanClone(clone)
  const title = safeFilename(
    document.title || element.tagName.toLowerCase(),
    'element',
  )
  const notice = targets.length
    ? `<p class="notice">OCR 已识别 ${recognized} 处，失败 ${failed} 处。识别文本可能有误，请核对原网页。</p>`
    : ''
  const pageStyles = Array.from(
    document.querySelectorAll('style, link[rel~="stylesheet"]'),
  )
    .map((node) => {
      const copy = node.cloneNode(true) as Element
      if (copy instanceof HTMLLinkElement)
        copy.href = absoluteUrl(copy.getAttribute('href') || '')
      return copy.outerHTML
    })
    .join('\n')
  const html = `<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${escapeHtml(location.href)}"><title>${escapeHtml(document.title || '页面元素')}</title>${pageStyles}<style>body{max-width:1000px;margin:36px auto;padding:24px;font:16px/1.7 system-ui,sans-serif;overflow-wrap:anywhere}img,video{max-width:100%;height:auto}.notice{padding:10px;background:#fff3cd}</style></head><body><p>原始页面：<a href="${escapeHtml(location.href)}">${escapeHtml(location.href)}</a></p>${notice}<hr>${clone.outerHTML}</body></html>`
  download(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
    `${title}.html`,
  )
  return { recognized, failed }
}
