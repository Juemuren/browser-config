import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import monkey, { cdn, type MonkeyUserScript } from 'vite-plugin-monkey'

const scripts = {
  table: {
    entry: 'src/table/main.ts',
    file: 'export-html-table.user.js',
    userscript: {
      name: '导出页面表格 CSV',
      namespace: 'https://github.com/Juemuren/browser-config',
      version: '2.0.0',
      description: '选择页面中的一个或多个表格导出 CSV',
      match: ['*://*/*'],
      'run-at': 'document-idle',
      grant: [],
    },
  },
  indexeddb: {
    entry: 'src/indexeddb/main.ts',
    file: 'export-indexed-db.user.js',
    userscript: {
      name: '导出 IndexedDB JSON',
      namespace: 'https://github.com/Juemuren/browser-config',
      version: '2.0.0',
      description: '扫描并选择页面数据库导出 JSON',
      match: ['*://*/*'],
      'run-at': 'document-idle',
      grant: [],
    },
  },
  html: {
    entry: 'src/html/main.ts',
    file: 'export-html.user.js',
    userscript: {
      name: '导出页面元素 HTML（OCR）',
      namespace: 'https://github.com/Juemuren/browser-config',
      version: '2.0.0',
      description: '点选页面元素，识别字体乱码并导出 HTML',
      match: ['*://*/*'],
      'run-at': 'document-idle',
      grant: [],
    },
  },
} satisfies Record<
  'table' | 'indexeddb' | 'html',
  { entry: string; file: string; userscript: MonkeyUserScript }
>

export default defineConfig(({ mode }) => {
  const script = scripts[mode as keyof typeof scripts]
  if (!script) throw new Error(`未知脚本模式: ${mode}`)
  return {
    plugins: [
      vue(),
      monkey({
        entry: script.entry,
        userscript: script.userscript,
        build: {
          fileName: script.file,
          externalGlobals: {
            vue: cdn.jsdelivr('Vue', 'dist/vue.runtime.global.prod.js'),
            jszip: cdn.jsdelivr('JSZip', 'dist/jszip.min.js'),
            html2canvas: cdn.jsdelivr('html2canvas', 'dist/html2canvas.min.js'),
            'tesseract.js': cdn.jsdelivr('Tesseract', 'dist/tesseract.min.js'),
          },
        },
      }),
    ],
    build: { outDir: 'dist', emptyOutDir: false },
  }
})
