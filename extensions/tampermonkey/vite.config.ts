import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import monkey, { cdn } from 'vite-plugin-monkey'

export default defineConfig({
  plugins: [
    vue(),
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: '页面导出工具',
        namespace: 'https://github.com/Juemuren/browser-config',
        version: '3.0.0',
        description: '导出页面表格、IndexedDB 和 HTML 元素',
        match: ['*://*/*'],
        'run-at': 'document-idle',
        grant: ['GM_registerMenuCommand'],
      },
      build: {
        fileName: 'browser-export.user.js',
        externalGlobals: {
          vue: cdn.jsdelivr('Vue', 'dist/vue.runtime.global.prod.js'),
          jszip: cdn.jsdelivr('JSZip', 'dist/jszip.min.js'),
          html2canvas: cdn.jsdelivr('html2canvas', 'dist/html2canvas.min.js'),
          'tesseract.js': cdn.jsdelivr('Tesseract', 'dist/tesseract.min.js'),
        },
      },
    }),
  ],
  build: { outDir: 'dist', emptyOutDir: true },
})
