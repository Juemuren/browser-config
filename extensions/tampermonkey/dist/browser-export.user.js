// ==UserScript==
// @name         页面导出工具
// @namespace    https://github.com/Juemuren/browser-config
// @version      3.0.0
// @description  导出页面表格、IndexedDB 和 HTML 元素
// @match        *://*/*
// @require      https://cdn.jsdelivr.net/npm/vue@3.5.44/dist/vue.runtime.global.prod.js
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.2/dist/jszip.min.js
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function (vue, html2canvas, tesseract_js, JSZip) {
  'use strict';

  const styles = ":host{all:initial;color-scheme:light dark;font:14px/1.5 system-ui,sans-serif}*{box-sizing:border-box}.launcher{position:fixed;right:20px;bottom:20px;z-index:2147483647}.panel{position:fixed;right:20px;bottom:72px;z-index:2147483647;width:min(380px,calc(100vw - 24px));max-height:min(70vh,560px);overflow:auto;padding:16px;border:1px solid #c5cbd3;border-radius:12px;background:#fff;color:#18212e;box-shadow:0 8px 30px #0004}.heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.heading strong{font-size:16px}h2{margin:0 0 12px;font-size:15px}button{font:inherit;cursor:pointer;padding:7px 11px;border-radius:7px;border:1px solid #a8b4c4;background:#f5f7fa;color:inherit}button:hover{background:#e8eef7}button:disabled{opacity:.55;cursor:not-allowed}button.primary{border-color:#1465cf;background:#1465cf;color:#fff}button.primary:hover{background:#0c53b0}.tabs{display:flex;gap:6px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #c5cbd3}.tabs button{flex:1;padding:6px 4px;font-size:12px}.tabs button[aria-pressed=true]{border-color:#1465cf;color:#1465cf}.actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0}.list{display:grid;gap:7px;max-height:300px;overflow:auto}.item{display:flex;align-items:flex-start;gap:8px;padding:8px;border-radius:7px;background:#f2f5f9;overflow-wrap:anywhere}.item input{margin-top:4px}.muted{color:#5e6978;font-size:12px}.status{margin:10px 0 0;overflow-wrap:anywhere}.error{color:#b42318}@media(prefers-color-scheme:dark){.panel{background:#1b2430;color:#eff4fa;border-color:#546274}.tabs{border-color:#546274}.tabs button[aria-pressed=true]{color:#8abaff}button{background:#2b3848;border-color:#607087}button:hover{background:#37485b}.item{background:#263342}.muted{color:#b2bfce}.error{color:#ff9e93}}";
  function mountPanel(component) {
    if (window.top !== window.self) return;
    const host2 = document.createElement("div");
    host2.dataset.browserExportPanel = "";
    const shadow = host2.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    const mount = document.createElement("div");
    shadow.append(style, mount);
    document.documentElement.append(host2);
    const app = vue.createApp(component);
    app.mount(mount);
    window.addEventListener(
      "pagehide",
      () => {
        app.unmount();
        host2.remove();
      },
      { once: true }
    );
    return host2;
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
  const exportStyles = "body{max-width:1000px;margin:36px auto;padding:24px;font:16px/1.7 system-ui,sans-serif;overflow-wrap:anywhere}img,video{max-width:100%;height:auto}.notice{padding:10px;background:#fff3cd}html body .source-link a{color:#0969da;text-decoration:underline;text-underline-offset:2px}html body .source-link a:hover{color:#0550ae}";
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
      const range = document.createRange();
      range.selectNodeContents(node);
      if (!Array.from(range.getClientRects()).some(
        (rect) => rect.width > 0 && rect.height > 0
      ))
        continue;
      if (forceOcr) {
        targets.push({ node, start: 0, end: value.length });
      } else if (garbled.test(value)) {
        targets.push({ node, start: 0, end: value.length });
      }
    }
    return targets;
  }
  function captureElement(node) {
    let element = node.parentElement;
    while (element instanceof HTMLElement) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return element;
      element = element.parentElement;
    }
    throw new Error("找不到可截图的文本容器");
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
  function preserveReadableText(original, recognized) {
    const source = Array.from(original);
    const result = Array.from(recognized.replace(/\s+/gu, ""));
    const width = result.length + 1;
    if ((source.length + 1) * width > 4e6)
      throw new Error("文本过长，无法安全对齐 OCR 结果");
    const scores = new Int32Array((source.length + 1) * width);
    const moves = new Uint8Array(scores.length);
    for (let row2 = 1; row2 <= source.length; row2++) {
      scores[row2 * width] = scores[(row2 - 1) * width] - 2;
      moves[row2 * width] = 1;
    }
    for (let column2 = 1; column2 <= result.length; column2++) {
      scores[column2] = scores[column2 - 1] - 2;
      moves[column2] = 2;
    }
    for (let row2 = 1; row2 <= source.length; row2++) {
      for (let column2 = 1; column2 <= result.length; column2++) {
        const index = row2 * width + column2;
        const character = source[row2 - 1];
        const diagonal = scores[index - width - 1] + (garbled.test(character) ? 1 : character === result[column2 - 1] ? 6 : -6);
        const removeSource = scores[index - width] - 2;
        const removeResult = scores[index - 1] - 2;
        if (diagonal >= removeSource && diagonal >= removeResult) {
          scores[index] = diagonal;
        } else if (removeSource >= removeResult) {
          scores[index] = removeSource;
          moves[index] = 1;
        } else {
          scores[index] = removeResult;
          moves[index] = 2;
        }
      }
    }
    const output = [];
    let row = source.length;
    let column = result.length;
    while (row > 0 || column > 0) {
      const move = moves[row * width + column];
      if (row > 0 && column > 0 && move === 0) {
        output.push(
          garbled.test(source[row - 1]) ? result[column - 1] : source[row - 1]
        );
        row--;
        column--;
      } else if (row > 0 && (column === 0 || move === 1)) {
        output.push(source[row - 1]);
        row--;
      } else {
        column--;
      }
    }
    return output.reverse().join("");
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
  function buildExportHtml(root, recognized, failed, hasOcr) {
    const exported = document.implementation.createHTMLDocument(
      document.title || "页面元素"
    );
    exported.documentElement.lang = "zh-CN";
    const charset = exported.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    const viewport = exported.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width,initial-scale=1";
    const base = exported.createElement("base");
    base.href = location.href;
    exported.head.prepend(charset, viewport, base);
    for (const node of document.querySelectorAll(
      'style, link[rel~="stylesheet"]'
    )) {
      const copy = exported.importNode(node, true);
      if (copy instanceof HTMLLinkElement)
        copy.href = absoluteUrl(copy.getAttribute("href") || "");
      exported.head.append(copy);
    }
    const style = exported.createElement("style");
    style.textContent = exportStyles;
    exported.head.append(style);
    const source = exported.createElement("p");
    source.className = "source-link";
    source.append("原始页面：");
    const link = exported.createElement("a");
    link.href = location.href;
    link.textContent = location.href;
    source.append(link);
    exported.body.append(source);
    if (hasOcr) {
      const notice = exported.createElement("p");
      notice.className = "notice";
      notice.textContent = `OCR 已识别 ${recognized} 处，失败 ${failed} 处。识别文本可能有误，请核对原网页。`;
      exported.body.append(notice);
    }
    exported.body.append(
      exported.createElement("hr"),
      exported.importNode(root, true)
    );
    return `<!DOCTYPE html>
${exported.documentElement.outerHTML}`;
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
        const container = captureElement(target.node);
        let captured = canvasCache.get(container);
        if (!captured) {
          captured = html2canvas(container, {
            scale: 2,
            backgroundColor: "#fff",
            useCORS: true,
            logging: false
          });
          canvasCache.set(container, captured);
        }
        const canvas = captureTarget(target, await captured, container);
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
          text: forceOcr ? normalizedText(text, original, parent) : preserveReadableText(original, text)
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
    const html = buildExportHtml(clone, recognized, failed, targets.length > 0);
    download(
      new Blob([html], { type: "text/html;charset=utf-8" }),
      `${title}.html`
    );
    return { recognized, failed };
  }
  const _hoisted_1$3 = { class: "item" };
  const _hoisted_2$3 = { class: "actions" };
  const _hoisted_3$3 = ["disabled"];
  const _hoisted_4$3 = ["disabled"];
  const _hoisted_5$3 = {
    class: "status",
    role: "status"
  };
  const _sfc_main$3 = vue.defineComponent({
    __name: "App",
    props: {
      active: { type: Boolean }
    },
    setup(__props) {
      const props = __props;
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
      vue.watch(
        () => props.active,
        (active) => {
          if (!active) stopPicking();
        }
      );
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
        return vue.openBlock(), vue.createElementBlock("div", null, [
          _cache[2] || (_cache[2] = vue.createElementVNode("h2", null, "导出页面元素", -1)),
          _cache[3] || (_cache[3] = vue.createElementVNode("p", { class: "muted" }, " 脚本会自动对含私用区字符的文本节点执行 OCR。 首次识别需要下载中文和英文模型。 ", -1)),
          vue.createElementVNode("label", _hoisted_1$3, [
            vue.withDirectives(vue.createElementVNode("input", {
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => forceOcr.value = $event),
              type: "checkbox"
            }, null, 512), [
              [vue.vModelCheckbox, forceOcr.value]
            ]),
            _cache[1] || (_cache[1] = vue.createTextVNode(" 强制识别所有文本 ", -1))
          ]),
          vue.createElementVNode("div", _hoisted_2$3, [
            vue.createElementVNode("button", {
              type: "button",
              disabled: busy.value,
              onClick: startPicking
            }, vue.toDisplayString(picking.value ? "正在选择…" : "选择元素"), 9, _hoisted_3$3),
            vue.createElementVNode("button", {
              class: "primary",
              type: "button",
              disabled: busy.value || !selected.value,
              onClick: save
            }, vue.toDisplayString(busy.value ? "处理中…" : "导出 HTML"), 9, _hoisted_4$3)
          ]),
          vue.createElementVNode("p", _hoisted_5$3, vue.toDisplayString(status.value), 1)
        ]);
      };
    }
  });
  async function scanDatabases() {
    if (!indexedDB.databases)
      throw new Error("浏览器不支持 indexedDB.databases()，无法枚举数据库");
    return (await indexedDB.databases()).filter(
      (item) => Boolean(item.name)
    ).map((item) => ({ name: item.name, version: item.version ?? 0 }));
  }
  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB 读取失败"));
    });
  }
  async function readDatabase(name) {
    const db = await requestValue(indexedDB.open(name));
    try {
      const names = Array.from(db.objectStoreNames);
      const stores = {};
      if (!names.length) return { name, version: db.version, stores };
      const transaction = db.transaction(names, "readonly");
      const finished = new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("事务失败"));
        transaction.onabort = () => reject(transaction.error ?? new Error("事务已中止"));
      });
      for (const storeName of names) {
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => {
          stores[storeName] = request.result;
        };
      }
      await finished;
      return { name, version: db.version, stores };
    } finally {
      db.close();
    }
  }
  function base64(bytes) {
    let result = "";
    for (let start = 0; start < bytes.length; start += 8192)
      result += String.fromCharCode(...bytes.subarray(start, start + 8192));
    return btoa(result);
  }
  async function jsonValue(value, seen = new WeakSet()) {
    if (typeof value === "bigint")
      return { $type: "BigInt", value: value.toString() };
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return { $type: "CircularReference" };
    seen.add(value);
    try {
      if (value instanceof Date)
        return { $type: "Date", value: value.toISOString() };
      if (value instanceof Blob)
        return {
          $type: "Blob",
          mimeType: value.type,
          base64: base64(new Uint8Array(await value.arrayBuffer()))
        };
      if (value instanceof ArrayBuffer)
        return { $type: "ArrayBuffer", base64: base64(new Uint8Array(value)) };
      if (ArrayBuffer.isView(value))
        return {
          $type: value.constructor.name,
          base64: base64(
            new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
          )
        };
      if (value instanceof Map)
        return {
          $type: "Map",
          entries: await Promise.all(
            Array.from(value, async ([key, item]) => [
              await jsonValue(key, seen),
              await jsonValue(item, seen)
            ])
          )
        };
      if (value instanceof Set)
        return {
          $type: "Set",
          values: await Promise.all(
            Array.from(value, (item) => jsonValue(item, seen))
          )
        };
      if (Array.isArray(value))
        return Promise.all(value.map((item) => jsonValue(item, seen)));
      return Object.fromEntries(
        await Promise.all(
          Object.entries(value).map(async ([key, item]) => [
            key,
            await jsonValue(item, seen)
          ])
        )
      );
    } finally {
      seen.delete(value);
    }
  }
  async function exportDatabases(names, update) {
    const databases = [];
    for (const [index, name] of names.entries()) {
      update(`读取数据库 ${index + 1}/${names.length}：${name}`);
      databases.push(await jsonValue(await readDatabase(name)));
    }
    const payload = {
      origin: location.origin,
      exportedAt: ( new Date()).toISOString(),
      databases
    };
    download(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8"
      }),
      `${safeFilename(location.hostname, "indexeddb")}-indexeddb.json`
    );
  }
  const _hoisted_1$2 = { class: "list" };
  const _hoisted_2$2 = ["value"];
  const _hoisted_3$2 = { class: "muted" };
  const _hoisted_4$2 = { class: "actions" };
  const _hoisted_5$2 = ["disabled"];
  const _hoisted_6$2 = ["disabled"];
  const _hoisted_7 = {
    class: "status",
    role: "status"
  };
  const _sfc_main$2 = vue.defineComponent({
    __name: "App",
    props: {
      active: { type: Boolean }
    },
    setup(__props) {
      const props = __props;
      const busy = vue.ref(false);
      const choices = vue.ref([]);
      const selected = vue.ref([]);
      const status = vue.ref("");
      async function scan() {
        busy.value = true;
        status.value = "扫描中…";
        try {
          choices.value = await scanDatabases();
          selected.value = choices.value.map((choice) => choice.name);
          status.value = choices.value.length ? `找到 ${choices.value.length} 个数据库` : "未发现数据库";
        } catch (error) {
          status.value = `扫描失败：${errorMessage(error)}`;
        } finally {
          busy.value = false;
        }
      }
      let initialized = false;
      vue.watch(
        () => props.active,
        (active) => {
          if (active && !initialized) {
            initialized = true;
            void scan();
          }
        },
        { immediate: true }
      );
      async function save() {
        busy.value = true;
        try {
          await exportDatabases(selected.value, (message) => {
            status.value = message;
          });
          status.value = "导出完成";
        } catch (error) {
          status.value = `导出失败：${errorMessage(error)}`;
        } finally {
          busy.value = false;
        }
      }
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", null, [
          _cache[1] || (_cache[1] = vue.createElementVNode("h2", null, "选择数据库", -1)),
          vue.createElementVNode("div", _hoisted_1$2, [
            (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(choices.value, (choice) => {
              return vue.openBlock(), vue.createElementBlock("label", {
                key: choice.name,
                class: "item"
              }, [
                vue.withDirectives(vue.createElementVNode("input", {
                  "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selected.value = $event),
                  type: "checkbox",
                  value: choice.name
                }, null, 8, _hoisted_2$2), [
                  [vue.vModelCheckbox, selected.value]
                ]),
                vue.createElementVNode("span", null, [
                  vue.createTextVNode(vue.toDisplayString(choice.name) + " ", 1),
                  vue.createElementVNode("span", _hoisted_3$2, "（版本 " + vue.toDisplayString(choice.version) + "）", 1)
                ])
              ]);
            }), 128))
          ]),
          vue.createElementVNode("div", _hoisted_4$2, [
            vue.createElementVNode("button", {
              type: "button",
              disabled: busy.value,
              onClick: scan
            }, "重新扫描", 8, _hoisted_5$2),
            vue.createElementVNode("button", {
              class: "primary",
              type: "button",
              disabled: busy.value || !selected.value.length,
              onClick: save
            }, vue.toDisplayString(busy.value ? "处理中…" : `导出 ${selected.value.length} 个`), 9, _hoisted_6$2)
          ]),
          vue.createElementVNode("p", _hoisted_7, vue.toDisplayString(status.value), 1)
        ]);
      };
    }
  });
  function scanTables() {
    return Array.from(document.querySelectorAll("table")).map(
      (element, index) => {
        const firstRow = element.rows[0];
        const caption = element.caption?.textContent?.trim();
        return {
          element,
          label: caption || `表格 ${index + 1}`,
          rows: element.rows.length,
          columns: firstRow?.cells.length ?? 0
        };
      }
    );
  }
  function csvCell(value) {
    const clean = value.trim().replace(/\r\n?/g, "\n");
    return /[",\n]/.test(clean) ? `"${clean.replace(/"/g, '""')}"` : clean;
  }
  function toCsv(table) {
    const rows = Array.from(
      table.rows,
      (row) => Array.from(
        row.cells,
        (cell) => csvCell(cell.innerText || cell.textContent || "")
      ).join(",")
    );
    return `\uFEFF${rows.join("\r\n")}`;
  }
  async function exportTables(choices) {
    const base = safeFilename(document.title, "table");
    if (choices.length === 1) {
      download(
        new Blob([toCsv(choices[0].element)], { type: "text/csv;charset=utf-8" }),
        `${base}.csv`
      );
      return;
    }
    const zip = new JSZip();
    for (const [index, choice] of choices.entries()) {
      zip.file(
        `${String(index + 1).padStart(2, "0")}-${safeFilename(choice.label, "table")}.csv`,
        toCsv(choice.element)
      );
    }
    download(await zip.generateAsync({ type: "blob" }), `${base}-tables.zip`);
  }
  const _hoisted_1$1 = { class: "list" };
  const _hoisted_2$1 = ["value"];
  const _hoisted_3$1 = { class: "muted" };
  const _hoisted_4$1 = { class: "actions" };
  const _hoisted_5$1 = ["disabled"];
  const _hoisted_6$1 = {
    class: "status",
    role: "status"
  };
  const _sfc_main$1 = vue.defineComponent({
    __name: "App",
    props: {
      active: { type: Boolean }
    },
    setup(__props) {
      const props = __props;
      const busy = vue.ref(false);
      const choices = vue.ref([]);
      const selected = vue.ref([]);
      const status = vue.ref("");
      function scan() {
        choices.value = scanTables();
        selected.value = choices.value.map((choice) => choice.element);
        status.value = choices.value.length ? `找到 ${choices.value.length} 个表格` : "当前页面没有找到表格";
      }
      let initialized = false;
      vue.watch(
        () => props.active,
        (active) => {
          if (active && !initialized) {
            initialized = true;
            scan();
          }
        },
        { immediate: true }
      );
      async function save() {
        busy.value = true;
        try {
          await exportTables(
            choices.value.filter((choice) => selected.value.includes(choice.element))
          );
          status.value = "导出完成";
        } catch (error) {
          status.value = `导出失败：${errorMessage(error)}`;
        } finally {
          busy.value = false;
        }
      }
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", null, [
          _cache[1] || (_cache[1] = vue.createElementVNode("h2", null, "选择表格", -1)),
          vue.createElementVNode("div", _hoisted_1$1, [
            (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(choices.value, (choice, index) => {
              return vue.openBlock(), vue.createElementBlock("label", {
                key: index,
                class: "item"
              }, [
                vue.withDirectives(vue.createElementVNode("input", {
                  "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selected.value = $event),
                  type: "checkbox",
                  value: choice.element
                }, null, 8, _hoisted_2$1), [
                  [vue.vModelCheckbox, selected.value]
                ]),
                vue.createElementVNode("span", null, [
                  vue.createTextVNode(vue.toDisplayString(choice.label) + " ", 1),
                  vue.createElementVNode("span", _hoisted_3$1, " （" + vue.toDisplayString(choice.rows) + "行 x " + vue.toDisplayString(choice.columns) + " 列） ", 1)
                ])
              ]);
            }), 128))
          ]),
          vue.createElementVNode("div", _hoisted_4$1, [
            vue.createElementVNode("button", {
              type: "button",
              onClick: scan
            }, "重新扫描"),
            vue.createElementVNode("button", {
              class: "primary",
              type: "button",
              disabled: busy.value || !selected.value.length,
              onClick: save
            }, vue.toDisplayString(busy.value ? "导出中…" : `导出 ${selected.value.length} 个`), 9, _hoisted_5$1)
          ]),
          vue.createElementVNode("p", _hoisted_6$1, vue.toDisplayString(status.value), 1)
        ]);
      };
    }
  });
  const widgetVisible = vue.ref(true);
  const _hoisted_1 = {
    class: "panel",
    "aria-label": "页面导出工具"
  };
  const _hoisted_2 = { class: "heading" };
  const _hoisted_3 = {
    class: "tabs",
    "aria-label": "导出类型"
  };
  const _hoisted_4 = ["aria-pressed"];
  const _hoisted_5 = ["aria-pressed"];
  const _hoisted_6 = ["aria-pressed"];
  const _sfc_main = vue.defineComponent({
    __name: "App",
    setup(__props) {
      const open = vue.ref(false);
      const active = vue.ref("table");
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock(vue.Fragment, null, [
          vue.createElementVNode("button", {
            class: "launcher primary",
            type: "button",
            onClick: _cache[0] || (_cache[0] = ($event) => open.value = !open.value)
          }, " 导出工具 "),
          vue.withDirectives(vue.createElementVNode("section", _hoisted_1, [
            vue.createElementVNode("div", _hoisted_2, [
              _cache[5] || (_cache[5] = vue.createElementVNode("strong", null, "页面导出工具", -1)),
              vue.createElementVNode("button", {
                type: "button",
                onClick: _cache[1] || (_cache[1] = ($event) => open.value = false)
              }, "关闭")
            ]),
            vue.createElementVNode("nav", _hoisted_3, [
              vue.createElementVNode("button", {
                type: "button",
                "aria-pressed": active.value === "table",
                onClick: _cache[2] || (_cache[2] = ($event) => active.value = "table")
              }, " 表格 CSV ", 8, _hoisted_4),
              vue.createElementVNode("button", {
                type: "button",
                "aria-pressed": active.value === "indexeddb",
                onClick: _cache[3] || (_cache[3] = ($event) => active.value = "indexeddb")
              }, " IndexedDB ", 8, _hoisted_5),
              vue.createElementVNode("button", {
                type: "button",
                "aria-pressed": active.value === "html",
                onClick: _cache[4] || (_cache[4] = ($event) => active.value = "html")
              }, " 元素 HTML ", 8, _hoisted_6)
            ]),
            vue.withDirectives(vue.createVNode(_sfc_main$1, {
              active: open.value && active.value === "table"
            }, null, 8, ["active"]), [
              [vue.vShow, active.value === "table"]
            ]),
            vue.withDirectives(vue.createVNode(_sfc_main$2, {
              active: open.value && active.value === "indexeddb"
            }, null, 8, ["active"]), [
              [vue.vShow, active.value === "indexeddb"]
            ]),
            vue.withDirectives(vue.createVNode(_sfc_main$3, {
              active: open.value && vue.unref(widgetVisible) && active.value === "html"
            }, null, 8, ["active"]), [
              [vue.vShow, active.value === "html"]
            ])
          ], 512), [
            [vue.vShow, open.value]
          ])
        ], 64);
      };
    }
  });
  const host = mountPanel(_sfc_main);
  if (host) {
    const toggleWidget = () => {
      widgetVisible.value = !widgetVisible.value;
      host.style.display = widgetVisible.value ? "" : "none";
      GM_registerMenuCommand(
        widgetVisible.value ? "隐藏页面导出工具" : "显示页面导出工具",
        toggleWidget,
        { id: menuId }
      );
    };
    const menuId = GM_registerMenuCommand("隐藏页面导出工具", toggleWidget);
  }

})(Vue, html2canvas, Tesseract, JSZip);