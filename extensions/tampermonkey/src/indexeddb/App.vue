<script setup lang="ts">
import { ref, watch } from 'vue'
import { errorMessage } from '../shared'
import { type DatabaseChoice, exportDatabases, scanDatabases } from './export'

const props = defineProps<{ active: boolean }>()
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
let initialized = false
watch(
  () => props.active,
  (active) => {
    if (active && !initialized) {
      initialized = true
      void scan()
    }
  },
  { immediate: true },
)
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
  <div>
    <h2>选择数据库</h2>
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
  </div>
</template>
