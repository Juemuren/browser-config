import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import monkey from 'vite-plugin-monkey'

const scripts = {
  table: {
    entry: 'src/table/main.ts',
    name: '导出页面表格 CSV',
    description: '选择页面中的一个或多个表格导出 CSV',
    file: 'export-html-table.user.js',
  },
  indexeddb: {
    entry: 'src/indexeddb/main.ts',
    name: '导出 IndexedDB JSON',
    description: '扫描并选择页面数据库导出 JSON',
    file: 'export-indexed-db.user.js',
  },
  html: {
    entry: 'src/html/main.ts',
    name: '导出页面元素 HTML（OCR）',
    description: '点选页面元素，识别字体乱码并导出 HTML',
    file: 'export-html.user.js',
  },
} as const

export default defineConfig(({ mode }) => {
  const script = scripts[mode as keyof typeof scripts]
  if (!script) throw new Error(`未知脚本模式: ${mode}`)
  return {
    plugins: [
      vue(),
      monkey({
        entry: script.entry,
        userscript: {
          name: script.name,
          namespace: 'https://github.com/Juemuren/browser-config',
          version: '2.0.0',
          description: script.description,
          match: ['*://*/*'],
          'run-at': 'document-idle',
          grant: 'none',
        },
        build: { fileName: script.file },
      }),
    ],
    build: { outDir: 'dist', emptyOutDir: false },
  }
})
