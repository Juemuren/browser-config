<script setup lang="ts">
import { ref } from 'vue'
import { errorMessage } from '../shared'
import { type DatabaseChoice, exportDatabases, scanDatabases } from './export'

const open = ref(false)
const busy = ref(false)
const choices = ref<DatabaseChoice[]>([])
const selected = ref<string[]>([])
const status = ref('')

async function scan() {
  busy.value = true
  status.value = '扫描中…'
  try {
    choices.value = await scanDatabases()
    selected.value = choices.value.map((choice) => choice.name)
    status.value = choices.value.length
      ? `找到 ${choices.value.length} 个数据库`
      : '未发现数据库'
  } catch (error) {
    status.value = `扫描失败：${errorMessage(error)}`
  } finally {
    busy.value = false
  }
}
function toggle() {
  open.value = !open.value
  if (open.value) void scan()
}
async function save() {
  busy.value = true
  try {
    await exportDatabases(selected.value, (message) => {
      status.value = message
    })
    status.value = '导出完成'
  } catch (error) {
    status.value = `导出失败：${errorMessage(error)}`
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <button class="launcher primary" type="button" @click="toggle">
    导出 IndexedDB
  </button>
  <section v-if="open" class="panel" aria-label="IndexedDB 导出">
    <div class="heading">
      <strong>选择数据库</strong>
      <button type="button" @click="open = false">关闭</button>
    </div>
    <div class="list">
      <label v-for="choice in choices" :key="choice.name" class="item">
        <input v-model="selected" type="checkbox" :value="choice.name">
        <span>
          {{ choice.name }}
          <span class="muted">（版本 {{ choice.version }}）</span>
        </span>
      </label>
    </div>
    <div class="actions">
      <button type="button" :disabled="busy" @click="scan">重新扫描</button>
      <button
        class="primary"
        type="button"
        :disabled="busy || !selected.length"
        @click="save"
      >
        {{ busy ? '处理中…' : `导出 ${selected.length} 个` }}
      </button>
    </div>
    <p class="status" role="status">{{ status }}</p>
  </section>
</template>
