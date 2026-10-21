// ==UserScript==
// @name         导出 IndexedDB JSON
// @namespace    https://github.com/Juemuren/browser-config
// @version      2.0.0
// @description  扫描并选择页面数据库导出 JSON
// @match        *://*/*
// @require      https://cdn.jsdelivr.net/npm/vue@3.5.44/dist/vue.runtime.global.prod.js
// @run-at       document-idle
// ==/UserScript==

(function (vue) {
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
  const _hoisted_1 = {
    key: 0,
    class: "panel",
    "aria-label": "IndexedDB 导出"
  };
  const _hoisted_2 = { class: "heading" };
  const _hoisted_3 = { class: "list" };
  const _hoisted_4 = ["value"];
  const _hoisted_5 = { class: "muted" };
  const _hoisted_6 = { class: "actions" };
  const _hoisted_7 = ["disabled"];
  const _hoisted_8 = ["disabled"];
  const _hoisted_9 = {
    class: "status",
    role: "status"
  };
  const _sfc_main = vue.defineComponent({
    __name: "App",
    setup(__props) {
      const open = vue.ref(false);
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
      function toggle() {
        open.value = !open.value;
        if (open.value) void scan();
      }
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
        return vue.openBlock(), vue.createElementBlock(vue.Fragment, null, [
          vue.createElementVNode("button", {
            class: "launcher primary",
            type: "button",
            onClick: toggle
          }, " 导出 IndexedDB "),
          open.value ? (vue.openBlock(), vue.createElementBlock("section", _hoisted_1, [
            vue.createElementVNode("div", _hoisted_2, [
              _cache[2] || (_cache[2] = vue.createElementVNode("strong", null, "选择数据库", -1)),
              vue.createElementVNode("button", {
                type: "button",
                onClick: _cache[0] || (_cache[0] = ($event) => open.value = false)
              }, "关闭")
            ]),
            vue.createElementVNode("div", _hoisted_3, [
              (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(choices.value, (choice) => {
                return vue.openBlock(), vue.createElementBlock("label", {
                  key: choice.name,
                  class: "item"
                }, [
                  vue.withDirectives(vue.createElementVNode("input", {
                    "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => selected.value = $event),
                    type: "checkbox",
                    value: choice.name
                  }, null, 8, _hoisted_4), [
                    [vue.vModelCheckbox, selected.value]
                  ]),
                  vue.createElementVNode("span", null, [
                    vue.createTextVNode(vue.toDisplayString(choice.name) + " ", 1),
                    vue.createElementVNode("span", _hoisted_5, "（版本 " + vue.toDisplayString(choice.version) + "）", 1)
                  ])
                ]);
              }), 128))
            ]),
            vue.createElementVNode("div", _hoisted_6, [
              vue.createElementVNode("button", {
                type: "button",
                disabled: busy.value,
                onClick: scan
              }, "重新扫描", 8, _hoisted_7),
              vue.createElementVNode("button", {
                class: "primary",
                type: "button",
                disabled: busy.value || !selected.value.length,
                onClick: save
              }, vue.toDisplayString(busy.value ? "处理中…" : `导出 ${selected.value.length} 个`), 9, _hoisted_8)
            ]),
            vue.createElementVNode("p", _hoisted_9, vue.toDisplayString(status.value), 1)
          ])) : vue.createCommentVNode("", true)
        ], 64);
      };
    }
  });
  mountPanel(_sfc_main);

})(Vue);