<script setup lang="ts">
import { ref, watch } from 'vue'
import { errorMessage } from '../shared'
import { exportTables, scanTables, type TableChoice } from './export'

const props = defineProps<{ active: boolean }>()
const busy = ref(false)
const choices = ref<TableChoice[]>([])
const selected = ref<HTMLTableElement[]>([])
const status = ref('')

function scan() {
  choices.value = scanTables()
  selected.value = choices.value.map((choice) => choice.element)
  status.value = choices.value.length
    ? `找到 ${choices.value.length} 个表格`
    : '当前页面没有找到表格'
}
let initialized = false
watch(
  () => props.active,
  (active) => {
    if (active && !initialized) {
      initialized = true
      scan()
    }
  },
  { immediate: true },
)
async function save() {
  busy.value = true
  try {
    await exportTables(
      choices.value.filter((choice) => selected.value.includes(choice.element)),
    )
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
    <h2>选择表格</h2>
    <div class="list">
      <label v-for="(choice, index) in choices" :key="index" class="item">
        <input v-model="selected" type="checkbox" :value="choice.element">
        <span>
          {{ choice.label }}
          <span class="muted">
            （{{ choice.rows }}行 x {{ choice.columns }} 列）
          </span>
        </span>
      </label>
    </div>
    <div class="actions">
      <button type="button" @click="scan">重新扫描</button>
      <button
        class="primary"
        type="button"
        :disabled="busy || !selected.length"
        @click="save"
      >
        {{ busy ? '导出中…' : `导出 ${selected.length} 个` }}
      </button>
    </div>
    <p class="status" role="status">{{ status }}</p>
  </div>
</template>
