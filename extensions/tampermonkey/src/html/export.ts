import html2canvas from 'html2canvas'
import { createWorker, type Worker } from 'tesseract.js'
import { download, safeFilename } from '../shared'

const garbled = /[\uE000-\uF8FF]/u
let workerPromise: Promise<Worker> | undefined

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

function ocrTargets(root: Element): Element[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const targets = new Set<Element>()
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (!garbled.test(node.textContent || '')) continue
    const parent = node.parentElement
    if (parent && !parent.closest('script, style, noscript'))
      targets.add(parent)
  }
  return Array.from(targets).filter(
    (target) =>
      !Array.from(targets).some(
        (other) => other !== target && other.contains(target),
      ),
  )
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
  const targets = forceOcr ? [element] : ocrTargets(element)
  const originals = [element, ...Array.from(element.querySelectorAll('*'))]
  const clone = element.cloneNode(true) as Element
  const copies = [clone, ...Array.from(clone.querySelectorAll('*'))]
  let recognized = 0
  let failed = 0
  for (const [index, target] of targets.entries()) {
    update(`OCR 识别 ${index + 1}/${targets.length}…`)
    try {
      const canvas = await html2canvas(target as HTMLElement, {
        scale: 2,
        backgroundColor: '#fff',
        useCORS: true,
        logging: false,
      })
      if (!canvas.width || !canvas.height) throw new Error('截图尺寸无效')
      const result = await (await getWorker()).recognize(canvas)
      const text = result.data.text.trim()
      if (!text) throw new Error('OCR 结果为空')
      const copy = copies[originals.indexOf(target)]
      copy?.replaceChildren(document.createTextNode(text))
      recognized++
    } catch (error) {
      console.warn('[HTML 导出] OCR 失败，保留原文', error)
      failed++
    }
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
