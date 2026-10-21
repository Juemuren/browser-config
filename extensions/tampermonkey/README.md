# 用户脚本

使用 vite-plugin-monkey、Vue 3 和 TypeScript 构建 Tampermonkey 用户脚本。

## 脚本说明

- `dist/export-html-table.user.js`：扫描页面的 HTML 表格，可勾选一个或多个。单选下载带 UTF-8 BOM 的 CSV；多选下载包含多个 CSV 的 ZIP。
- `dist/export-indexed-db.user.js`：扫描当前来源可枚举的 IndexedDB，可勾选一个或多个，下载合并的 JSON。Blob、二进制、日期、BigInt 等值以带 `$type` 标记的 JSON 对象保存。
- `dist/export-html.user.js`：点击按钮后点选页面元素，导出完整 HTML。含 Unicode 私用区字符的文本节点会自动截图并通过中文、英文 OCR 识别，替换仅发生在导出副本。若网站用普通字符做字体映射，可勾选“整个元素执行 OCR”；这会识别选中元素内的所有可识别文字节点，并保留原有标签与层级。HTML 导出的首次 OCR 需要联网下载识别模型。

## 构建与安装

先在本目录运行

```sh
npm install
npm run build
```

然后在 Tampermonkey 中分别安装 `dist` 中的 `.user.js` 文件。

`npm run build` 会构建所有脚本。也可以分别进行构建

```sh
npm run build:table
npm run build:indexeddb
npm run build:html
```

## 开发

单独开发脚本时使用

```sh
npm run dev:table
npm run dev:indexeddb
npm run dev:html
```

类型检查

```sh
npm run typecheck
```

静态检查和格式化

```sh
npm run format
npm run lint
# lint + format
npm run check
```
