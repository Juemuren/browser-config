# 用户脚本

使用 vite-plugin-monkey、Vue 3 和 TypeScript 构建 Tampermonkey 用户脚本。

## 功能

### browser-export.user.js

- 表格导出为 CSV：扫描页面的 HTML 表格，可勾选一个或多个。单选下载带 UTF-8 BOM 的 CSV；多选下载包含多个 CSV 的 ZIP。
- IndexedDB 导出为 JSON：扫描当前来源可枚举的 IndexedDB，可勾选一个或多个，下载合并的 JSON。Blob、二进制、日期、BigInt 等值以带 `$type` 标记的 JSON 对象保存。
- 元素 OCR 后导出为 HTML：点选页面元素，导出完整 HTML。含 Unicode 私用区字符的文本节点会自动截图并通过中文、英文 OCR 识别；默认只替换私用区字符，保留原有正常文字、空格与 DOM 结构。若网站用普通字符做字体映射，可勾选“强制识别所有文本”。首次 OCR 需要联网下载识别模型。

控件会自动显示在页面右下角。可以在 Tampermonkey 菜单中的 `隐藏页面导出工具` 关闭整个悬浮控件，用 `显示页面导出工具` 取消隐藏。

## 构建与安装

先在本目录运行

```sh
npm install
npm run build
```

然后在 Tampermonkey 中安装 `dist/browser-export.user.js`。

## 开发

开发脚本时使用

```sh
npm run dev
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
