// ==UserScript==
// @name         导出页面表格 CSV
// @namespace    https://github.com/Juemuren/browser-config
// @version      2.0.0
// @description  选择页面中的一个或多个表格导出 CSV
// @match        *://*/*
// @require      https://cdn.jsdelivr.net/npm/vue@3.5.44/dist/vue.runtime.global.prod.js
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.2/dist/jszip.min.js
// @run-at       document-idle
// ==/UserScript==

(function (vue, JSZip) {
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
  const _hoisted_1 = {
    key: 0,
    class: "panel",
    "aria-label": "表格导出"
  };
  const _hoisted_2 = { class: "heading" };
  const _hoisted_3 = { class: "list" };
  const _hoisted_4 = ["value"];
  const _hoisted_5 = { class: "muted" };
  const _hoisted_6 = { class: "actions" };
  const _hoisted_7 = ["disabled"];
  const _hoisted_8 = {
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
      function scan() {
        choices.value = scanTables();
        selected.value = choices.value.map((choice) => choice.element);
        status.value = choices.value.length ? `找到 ${choices.value.length} 个表格` : "当前页面没有找到表格";
      }
      function toggle() {
        open.value = !open.value;
        if (open.value) scan();
      }
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
        return vue.openBlock(), vue.createElementBlock(vue.Fragment, null, [
          vue.createElementVNode("button", {
            class: "launcher primary",
            type: "button",
            onClick: toggle
          }, " 导出表格 CSV "),
          open.value ? (vue.openBlock(), vue.createElementBlock("section", _hoisted_1, [
            vue.createElementVNode("div", _hoisted_2, [
              _cache[2] || (_cache[2] = vue.createElementVNode("strong", null, "选择表格", -1)),
              vue.createElementVNode("button", {
                type: "button",
                onClick: _cache[0] || (_cache[0] = ($event) => open.value = false)
              }, "关闭")
            ]),
            vue.createElementVNode("div", _hoisted_3, [
              (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(choices.value, (choice, index) => {
                return vue.openBlock(), vue.createElementBlock("label", {
                  key: index,
                  class: "item"
                }, [
                  vue.withDirectives(vue.createElementVNode("input", {
                    "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => selected.value = $event),
                    type: "checkbox",
                    value: choice.element
                  }, null, 8, _hoisted_4), [
                    [vue.vModelCheckbox, selected.value]
                  ]),
                  vue.createElementVNode("span", null, [
                    vue.createTextVNode(vue.toDisplayString(choice.label) + " ", 1),
                    vue.createElementVNode("span", _hoisted_5, "（" + vue.toDisplayString(choice.rows) + " 行 × " + vue.toDisplayString(choice.columns) + " 列）", 1)
                  ])
                ]);
              }), 128))
            ]),
            vue.createElementVNode("div", _hoisted_6, [
              vue.createElementVNode("button", {
                type: "button",
                onClick: scan
              }, "重新扫描"),
              vue.createElementVNode("button", {
                class: "primary",
                type: "button",
                disabled: busy.value || !selected.value.length,
                onClick: save
              }, vue.toDisplayString(busy.value ? "导出中…" : `导出 ${selected.value.length} 个`), 9, _hoisted_7)
            ]),
            vue.createElementVNode("p", _hoisted_8, vue.toDisplayString(status.value), 1)
          ])) : vue.createCommentVNode("", true)
        ], 64);
      };
    }
  });
  mountPanel(_sfc_main);

})(Vue, JSZip);