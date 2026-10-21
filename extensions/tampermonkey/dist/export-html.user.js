// ==UserScript==
// @name         导出页面元素 HTML（OCR）
// @namespace    https://github.com/Juemuren/browser-config
// @version      2.0.2
// @description  点选页面元素，识别字体乱码并导出 HTML
// @match        *://*/*
// @require      https://cdn.jsdelivr.net/npm/vue@3.5.44/dist/vue.runtime.global.prod.js
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js
// @run-at       document-idle
// ==/UserScript==

(function (vue, html2canvas, tesseract_js) {
  'use strict';

  const styles = ":host{all:initial;color-scheme:light dark;font:14px/1.5 system-ui,sans-serif}*{box-sizing:border-box}.launcher{position:fixed;right:20px;bottom:20px;z-index:2147483647}.panel{position:fixed;right:20px;bottom:72px;z-index:2147483647;width:min(380px,calc(100vw - 24px));max-height:min(70vh,560px);overflow:auto;padding:16px;border:1px solid #c5cbd3;border-radius:12px;background:#fff;color:#18212e;box-shadow:0 8px 30px #0004}.heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.heading strong{font-size:16px}button{font:inherit;cursor:pointer;padding:7px 11px;border-radius:7px;border:1px solid #a8b4c4;background:#f5f7fa;color:inherit}button:hover{background:#e8eef7}button:disabled{opacity:.55;cursor:not-allowed}button.primary{border-color:#1465cf;background:#1465cf;color:#fff}button.primary:hover{background:#0c53b0}.actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0}.list{display:grid;gap:7px;max-height:300px;overflow:auto}.item{display:flex;align-items:flex-start;gap:8px;padding:8px;border-radius:7px;background:#f2f5f9;overflow-wrap:anywhere}.item input{margin-top:4px}.muted{color:#5e6978;font-size:12px}.status{margin:10px 0 0;overflow-wrap:anywhere}.error{color:#b42318}@media(prefers-color-scheme:dark){.panel{background:#1b2430;color:#eff4fa;border-color:#546274}button{background:#2b3848;border-color:#607087}button:hover{background:#37485b}.item{background:#263342}.muted{color:#b2bfce}.error{color:#ff9e93}}";
  function mountPanel(component) {
    if (window.top !== window.self) return;
    const host = document.createElement("div");
    host.dataset.browserExportPanel = "";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    const mount = document.createElement("div");
    shadow.append(style, mount);
    document.documentElement.append(host);
    const app = vue.createApp(component);
    app.mount(mount);
    window.addEventListener(
      "pagehide",
      () => {
        app.unmount();
        host.remove();
      },
      { once: true }
    );
  }
  function safeFilename(value, fallback) {
    return Array.from(
      value.replace(/[\\/:*?"<>|]/g, "_"),
      (character) => character.charCodeAt(0) < 32 ? "_" : character
    ).join("").trim().slice(0, 100) || fallback;
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3e4);
  }
  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }
  const garbled = /[\uE000-\uF8FF]/u;
  let workerPromise;
  function getWorker() {
    workerPromise ??= tesseract_js.createWorker(["chi_sim", "eng"]).catch((error) => {
      workerPromise = void 0;
      throw error;
    });
    return workerPromise;
  }
  async function stopWorker() {
    const pending = workerPromise;
    workerPromise = void 0;
    if (pending) await (await pending).terminate();
  }
  function textNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      nodes.push(node);
    }
    return nodes;
  }
  function ocrTargets(nodes, forceOcr) {
    const targets = [];
    for (const node of nodes) {
      const parent = node.parentElement;
      const value = node.nodeValue || "";
      if (!parent || parent.closest("script, style, noscript, textarea") || !value.trim())
        continue;
      if (forceOcr) {
        targets.push({ node, start: 0, end: value.length });
      } else if (garbled.test(value)) {
        targets.push({ node, start: 0, end: value.length });
      }
    }
    return targets;
  }
  function captureTarget(target, source, parent) {
    const range = document.createRange();
    range.setStart(target.node, target.start);
    range.setEnd(target.node, target.end);
    const rects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 0 && rect.height > 0
    );
    const parentRect = parent.getBoundingClientRect();
    if (!rects.length || !parentRect.width || !parentRect.height)
      throw new Error("文本区域不可见");
    const scaleX = source.width / parentRect.width;
    const scaleY = source.height / parentRect.height;
    const slices = rects.map((rect) => {
      const x = Math.max(0, Math.floor((rect.left - parentRect.left) * scaleX));
      const y = Math.max(0, Math.floor((rect.top - parentRect.top) * scaleY));
      return {
        x,
        y,
        width: Math.min(source.width - x, Math.ceil(rect.width * scaleX)),
        height: Math.min(source.height - y, Math.ceil(rect.height * scaleY))
      };
    }).filter((slice) => slice.width > 0 && slice.height > 0);
    if (!slices.length) throw new Error("文本截图尺寸无效");
    const padding = 8;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(...slices.map((slice) => slice.width)) + padding * 2;
    canvas.height = slices.reduce(
      (total, slice) => total + slice.height + padding,
      padding
    );
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建文本截图");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    let top = padding;
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
        slice.height
      );
      top += slice.height + padding;
    }
    return canvas;
  }
  function normalizedText(text, original, parent) {
    const whiteSpace = getComputedStyle(parent).whiteSpace;
    const content = whiteSpace.startsWith("pre") ? text.trim() : text.replace(/\s+/g, " ").trim();
    return `${original.match(/^\s*/)?.[0] || ""}${content}${original.match(/\s*$/)?.[0] || ""}`;
  }
  function absoluteUrl(value) {
    try {
      return new URL(value, location.href).href;
    } catch {
      return value;
    }
  }
  function cleanClone(root) {
    for (const element of root.querySelectorAll(
      "script, iframe, object, embed, meta[http-equiv], base"
    )) {
      element.remove();
    }
    for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
      for (const attr of Array.from(element.attributes)) {
        if (/^on/i.test(attr.name) || attr.name === "action" || attr.name === "formaction")
          element.removeAttribute(attr.name);
      }
      for (const name of ["href", "src", "poster"]) {
        const value = element.getAttribute(name);
        if (!value) continue;
        if (/^\s*(javascript|vbscript):/i.test(value))
          element.removeAttribute(name);
        else if (!/^\s*(data|blob|mailto|tel):/i.test(value))
          element.setAttribute(name, absoluteUrl(value));
      }
      const srcset = element.getAttribute("srcset");
      if (srcset)
        element.setAttribute(
          "srcset",
          srcset.split(",").map((item) => {
            const parts = item.trim().split(/\s+/);
            return [absoluteUrl(parts[0]), ...parts.slice(1)].join(" ");
          }).join(", ")
        );
    }
  }
  function escapeHtml(value) {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return value.replace(
      /[&<>"']/g,
      (character) => entities[character] ?? character
    );
  }
  async function exportElement(element, update, forceOcr = false) {
    await document.fonts.ready;
    const originals = textNodes(element);
    const targets = ocrTargets(originals, forceOcr);
    const clone = element.cloneNode(true);
    const copies = textNodes(clone);
    const canvasCache = new Map();
    const replacements = new Map();
    let recognized = 0;
    let failed = 0;
    for (const [index, target] of targets.entries()) {
      update(`OCR 识别 ${index + 1}/${targets.length}…`);
      try {
        const parent = target.node.parentElement;
        if (!(parent instanceof HTMLElement))
          throw new Error("不支持识别非 HTML 文本节点");
        let captured = canvasCache.get(parent);
        if (!captured) {
          captured = html2canvas(parent, {
            scale: 2,
            backgroundColor: "#fff",
            useCORS: true,
            logging: false
          });
          canvasCache.set(parent, captured);
        }
        const canvas = captureTarget(target, await captured, parent);
        const result = await (await getWorker()).recognize(canvas);
        const text = result.data.text.trim();
        if (!text) throw new Error("OCR 结果为空");
        const copy = copies[originals.indexOf(target.node)];
        if (!copy) throw new Error("找不到导出副本中的文本节点");
        const original = target.node.nodeValue?.slice(target.start, target.end) || "";
        const edits = replacements.get(target.node) || [];
        edits.push({
          start: target.start,
          end: target.end,
          text: normalizedText(text, original, parent)
        });
        replacements.set(target.node, edits);
        recognized++;
      } catch (error) {
        console.warn("[HTML 导出] OCR 失败，保留原文", error);
        failed++;
      }
    }
    for (const [node, edits] of replacements) {
      const copy = copies[originals.indexOf(node)];
      if (!copy) continue;
      let value = node.nodeValue || "";
      for (const edit of edits.sort((left, right) => right.start - left.start)) {
        value = value.slice(0, edit.start) + edit.text + value.slice(edit.end);
      }
      copy.nodeValue = value;
    }
    cleanClone(clone);
    const title = safeFilename(
      document.title || element.tagName.toLowerCase(),
      "element"
    );
    const notice = targets.length ? `<p class="notice">OCR 已识别 ${recognized} 处，失败 ${failed} 处。识别文本可能有误，请核对原网页。</p>` : "";
    const pageStyles = Array.from(
      document.querySelectorAll('style, link[rel~="stylesheet"]')
    ).map((node) => {
      const copy = node.cloneNode(true);
      if (copy instanceof HTMLLinkElement)
        copy.href = absoluteUrl(copy.getAttribute("href") || "");
      return copy.outerHTML;
    }).join("\n");
    const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${escapeHtml(location.href)}"><title>${escapeHtml(document.title || "页面元素")}</title>${pageStyles}<style>body{max-width:1000px;margin:36px auto;padding:24px;font:16px/1.7 system-ui,sans-serif;overflow-wrap:anywhere}img,video{max-width:100%;height:auto}.notice{padding:10px;background:#fff3cd}</style></head><body><p>原始页面：<a href="${escapeHtml(location.href)}">${escapeHtml(location.href)}</a></p>${notice}<hr>${clone.outerHTML}</body></html>`;
    download(
      new Blob([html], { type: "text/html;charset=utf-8" }),
      `${title}.html`
    );
    return { recognized, failed };
  }
  const _hoisted_1 = {
    key: 0,
    class: "panel",
    "aria-label": "HTML 导出"
  };
  const _hoisted_2 = { class: "heading" };
  const _hoisted_3 = { class: "item" };
  const _hoisted_4 = { class: "actions" };
  const _hoisted_5 = ["disabled"];
  const _hoisted_6 = ["disabled"];
  const _hoisted_7 = {
    class: "status",
    role: "status"
  };
  const _sfc_main = vue.defineComponent({
    __name: "App",
    setup(__props) {
      const open = vue.ref(false);
      const picking = vue.ref(false);
      const busy = vue.ref(false);
      const forceOcr = vue.ref(false);
      const selected = vue.ref(null);
      const status = vue.ref("点击“选择元素”，然后点击页面内容；Esc 取消。");
      let highlighted = null;
      let oldOutline = "";
      function clearHighlight() {
        if (highlighted) highlighted.style.outline = oldOutline;
        highlighted = null;
      }
      function highlight(target) {
        clearHighlight();
        if (!(target instanceof HTMLElement)) return;
        highlighted = target;
        oldOutline = target.style.outline;
        target.style.outline = "3px solid #1677ff";
      }
      function eventTarget(event) {
        const target = event.target;
        if (!(target instanceof Element)) return null;
        if (target.closest("[data-browser-export-panel]")) return null;
        return target;
      }
      function hover(event) {
        highlight(eventTarget(event));
      }
      function select(event) {
        const target = eventTarget(event);
        if (!target) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        selected.value = target;
        status.value = `已选择 <${target.tagName.toLowerCase()}>；可以继续选择或导出。`;
        stopPicking();
      }
      function keydown(event) {
        if (event.key === "Escape") stopPicking();
      }
      function stopPicking() {
        picking.value = false;
        document.removeEventListener("mouseover", hover, true);
        document.removeEventListener("click", select, true);
        document.removeEventListener("keydown", keydown, true);
        clearHighlight();
      }
      function startPicking() {
        if (picking.value) return;
        picking.value = true;
        status.value = "点击页面中的目标元素；Esc 取消。";
        document.addEventListener("mouseover", hover, true);
        document.addEventListener("click", select, true);
        document.addEventListener("keydown", keydown, true);
      }
      async function save() {
        if (!selected.value) return;
        busy.value = true;
        try {
          const result = await exportElement(
            selected.value,
            (message) => {
              status.value = message;
            },
            forceOcr.value
          );
          status.value = `导出完成：OCR 识别 ${result.recognized} 处，失败 ${result.failed} 处。`;
        } catch (error) {
          status.value = `导出失败：${errorMessage(error)}`;
        } finally {
          busy.value = false;
          await stopWorker().catch(console.warn);
        }
      }
      vue.onUnmounted(() => {
        stopPicking();
        void stopWorker().catch(console.warn);
      });
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock(vue.Fragment, null, [
          vue.createElementVNode("button", {
            class: "launcher primary",
            type: "button",
            onClick: _cache[0] || (_cache[0] = ($event) => open.value = !open.value)
          }, " 导出元素 HTML "),
          open.value ? (vue.openBlock(), vue.createElementBlock("section", _hoisted_1, [
            vue.createElementVNode("div", _hoisted_2, [
              _cache[3] || (_cache[3] = vue.createElementVNode("strong", null, "导出页面元素", -1)),
              vue.createElementVNode("button", {
                type: "button",
                onClick: _cache[1] || (_cache[1] = ($event) => {
                  open.value = false;
                  stopPicking();
                })
              }, "关闭")
            ]),
            _cache[5] || (_cache[5] = vue.createElementVNode("p", { class: "muted" }, " 脚本会自动对含私用区字符的文本节点执行 OCR。 首次识别需要下载中文和英文模型。 ", -1)),
            vue.createElementVNode("label", _hoisted_3, [
              vue.withDirectives(vue.createElementVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => forceOcr.value = $event),
                type: "checkbox"
              }, null, 512), [
                [vue.vModelCheckbox, forceOcr.value]
              ]),
              _cache[4] || (_cache[4] = vue.createTextVNode(" 强制识别所有文本 ", -1))
            ]),
            vue.createElementVNode("div", _hoisted_4, [
              vue.createElementVNode("button", {
                type: "button",
                disabled: busy.value,
                onClick: startPicking
              }, vue.toDisplayString(picking.value ? "正在选择…" : "选择元素"), 9, _hoisted_5),
              vue.createElementVNode("button", {
                class: "primary",
                type: "button",
                disabled: busy.value || !selected.value,
                onClick: save
              }, vue.toDisplayString(busy.value ? "处理中…" : "导出 HTML"), 9, _hoisted_6)
            ]),
            vue.createElementVNode("p", _hoisted_7, vue.toDisplayString(status.value), 1)
          ])) : vue.createCommentVNode("", true)
        ], 64);
      };
    }
  });
  mountPanel(_sfc_main);

})(Vue, html2canvas, Tesseract);