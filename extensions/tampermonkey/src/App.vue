<script setup lang="ts">
import { ref } from 'vue'
import HtmlExport from './html/App.vue'
import IndexedDbExport from './indexeddb/App.vue'
import TableExport from './table/App.vue'
import { widgetVisible } from './ui'

type Tool = 'table' | 'indexeddb' | 'html'

const open = ref(false)
const active = ref<Tool>('table')
</script>

<template>
  <button class="launcher primary" type="button" @click="open = !open">
    导出工具
  </button>
  <section v-show="open" class="panel" aria-label="页面导出工具">
    <div class="heading">
      <strong>页面导出工具</strong>
      <button type="button" @click="open = false">关闭</button>
    </div>
    <nav class="tabs" aria-label="导出类型">
      <button
        type="button"
        :aria-pressed="active === 'table'"
        @click="active = 'table'"
      >
        表格 CSV
      </button>
      <button
        type="button"
        :aria-pressed="active === 'indexeddb'"
        @click="active = 'indexeddb'"
      >
        IndexedDB
      </button>
      <button
        type="button"
        :aria-pressed="active === 'html'"
        @click="active = 'html'"
      >
        元素 HTML
      </button>
    </nav>
    <TableExport
      v-show="active === 'table'"
      :active="open && active === 'table'"
    />
    <IndexedDbExport
      v-show="active === 'indexeddb'"
      :active="open && active === 'indexeddb'"
    />
    <HtmlExport
      v-show="active === 'html'"
      :active="open && widgetVisible && active === 'html'"
    />
  </section>
</template>
