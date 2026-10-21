import html2canvas from 'html2canvas'
import { createWorker, type Worker } from 'tesseract.js'
import { download, safeFilename } from '../shared'
import exportStyles from './export.css?inline'

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
    const range = document.createRange()
    range.selectNodeContents(node)
    if (
      !Array.from(range.getClientRects()).some(
        (rect) => rect.width > 0 && rect.height > 0,
      )
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

function captureElement(node: Text): HTMLElement {
  let element = node.parentElement
  while (element instanceof HTMLElement) {
    // display: contents has visible text but no box to capture.
    const rect = element.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return element
    element = element.parentElement
  }
  throw new Error('找不到可截图的文本容器')
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

function preserveReadableText(original: string, recognized: string): string {
  // OCR aligns against the full line, but only private-use glyphs are replaced.
  const source = Array.from(original)
  const result = Array.from(recognized.replace(/\s+/gu, ''))
  const width = result.length + 1
  if ((source.length + 1) * width > 4_000_000)
    throw new Error('文本过长，无法安全对齐 OCR 结果')
  const scores = new Int32Array((source.length + 1) * width)
  const moves = new Uint8Array(scores.length)
  for (let row = 1; row <= source.length; row++) {
    scores[row * width] = scores[(row - 1) * width] - 2
    moves[row * width] = 1
  }
  for (let column = 1; column <= result.length; column++) {
    scores[column] = scores[column - 1] - 2
    moves[column] = 2
  }
  for (let row = 1; row <= source.length; row++) {
    for (let column = 1; column <= result.length; column++) {
      const index = row * width + column
      const character = source[row - 1]
      const diagonal =
        scores[index - width - 1] +
        (garbled.test(character)
          ? 1
          : character === result[column - 1]
            ? 6
            : -6)
      const removeSource = scores[index - width] - 2
      const removeResult = scores[index - 1] - 2
      if (diagonal >= removeSource && diagonal >= removeResult) {
        scores[index] = diagonal
      } else if (removeSource >= removeResult) {
        scores[index] = removeSource
        moves[index] = 1
      } else {
        scores[index] = removeResult
        moves[index] = 2
      }
    }
  }
  const output: string[] = []
  let row = source.length
  let column = result.length
  while (row > 0 || column > 0) {
    const move = moves[row * width + column]
    if (row > 0 && column > 0 && move === 0) {
      output.push(
        garbled.test(source[row - 1]) ? result[column - 1] : source[row - 1],
      )
      row--
      column--
    } else if (row > 0 && (column === 0 || move === 1)) {
      output.push(source[row - 1])
      row--
    } else {
      column--
    }
  }
  return output.reverse().join('')
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

function buildExportHtml(
  root: Element,
  recognized: number,
  failed: number,
  hasOcr: boolean,
): string {
  const exported = document.implementation.createHTMLDocument(
    document.title || '页面元素',
  )
  exported.documentElement.lang = 'zh-CN'

  const charset = exported.createElement('meta')
  charset.setAttribute('charset', 'utf-8')
  const viewport = exported.createElement('meta')
  viewport.name = 'viewport'
  viewport.content = 'width=device-width,initial-scale=1'
  const base = exported.createElement('base')
  base.href = location.href
  exported.head.prepend(charset, viewport, base)

  for (const node of document.querySelectorAll(
    'style, link[rel~="stylesheet"]',
  )) {
    const copy = exported.importNode(node, true)
    if (copy instanceof HTMLLinkElement)
      copy.href = absoluteUrl(copy.getAttribute('href') || '')
    exported.head.append(copy)
  }
  const style = exported.createElement('style')
  style.textContent = exportStyles
  exported.head.append(style)

  const source = exported.createElement('p')
  source.className = 'source-link'
  source.append('原始页面：')
  const link = exported.createElement('a')
  link.href = location.href
  link.textContent = location.href
  source.append(link)
  exported.body.append(source)

  if (hasOcr) {
    const notice = exported.createElement('p')
    notice.className = 'notice'
    notice.textContent = `OCR 已识别 ${recognized} 处，失败 ${failed} 处。识别文本可能有误，请核对原网页。`
    exported.body.append(notice)
  }
  exported.body.append(
    exported.createElement('hr'),
    exported.importNode(root, true),
  )
  return `<!DOCTYPE html>\n${exported.documentElement.outerHTML}`
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
      const container = captureElement(target.node)
      let captured = canvasCache.get(container)
      if (!captured) {
        captured = html2canvas(container, {
          scale: 2,
          backgroundColor: '#fff',
          useCORS: true,
          logging: false,
        })
        canvasCache.set(container, captured)
      }
      const canvas = captureTarget(target, await captured, container)
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
        text: forceOcr
          ? normalizedText(text, original, parent)
          : preserveReadableText(original, text),
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
  const html = buildExportHtml(clone, recognized, failed, targets.length > 0)
  download(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
    `${title}.html`,
  )
  return { recognized, failed }
}
