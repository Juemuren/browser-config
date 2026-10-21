<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { errorMessage } from '../shared'
import { exportElement, stopWorker } from './export'

const open = ref(false)
const picking = ref(false)
const busy = ref(false)
const forceOcr = ref(false)
const selected = ref<Element | null>(null)
const status = ref('点击“选择元素”，然后点击页面内容；Esc 取消。')
let highlighted: HTMLElement | null = null
let oldOutline = ''

function clearHighlight() {
  if (highlighted) highlighted.style.outline = oldOutline
  highlighted = null
}
function highlight(target: Element | null) {
  clearHighlight()
  if (!(target instanceof HTMLElement)) return
  highlighted = target
  oldOutline = target.style.outline
  target.style.outline = '3px solid #1677ff'
}
function eventTarget(event: Event): Element | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  if (target.closest('[data-browser-export-panel]')) return null
  return target
}
function hover(event: MouseEvent) {
  highlight(eventTarget(event))
}
function select(event: MouseEvent) {
  const target = eventTarget(event)
  if (!target) return
  event.preventDefault()
  event.stopImmediatePropagation()
  selected.value = target
  status.value = `已选择 <${target.tagName.toLowerCase()}>；可以继续选择或导出。`
  stopPicking()
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') stopPicking()
}
function stopPicking() {
  picking.value = false
  document.removeEventListener('mouseover', hover, true)
  document.removeEventListener('click', select, true)
  document.removeEventListener('keydown', keydown, true)
  clearHighlight()
}
function startPicking() {
  if (picking.value) return
  picking.value = true
  status.value = '点击页面中的目标元素；Esc 取消。'
  document.addEventListener('mouseover', hover, true)
  document.addEventListener('click', select, true)
  document.addEventListener('keydown', keydown, true)
}
async function save() {
  if (!selected.value) return
  busy.value = true
  try {
    const result = await exportElement(
      selected.value,
      (message) => {
        status.value = message
      },
      forceOcr.value,
    )
    status.value = `导出完成：OCR 识别 ${result.recognized} 处，失败 ${result.failed} 处。`
  } catch (error) {
    status.value = `导出失败：${errorMessage(error)}`
  } finally {
    busy.value = false
    await stopWorker().catch(console.warn)
  }
}
onUnmounted(() => {
  stopPicking()
  void stopWorker().catch(console.warn)
})
</script>

<template>
  <button class="launcher primary" type="button" @click="open = !open">
    导出元素 HTML
  </button>
  <section v-if="open" class="panel" aria-label="HTML 导出">
    <div class="heading">
      <strong>导出页面元素</strong>
      <button type="button" @click="open = false; stopPicking()">关闭</button>
    </div>
    <p class="muted">
      脚本会自动对含私用区字符的文本节点执行 OCR。
      首次识别需要下载中文和英文模型。
    </p>
    <label class="item">
      <input v-model="forceOcr" type="checkbox">
      强制识别所有文本
    </label>
    <div class="actions">
      <button type="button" :disabled="busy" @click="startPicking">
        {{ picking ? '正在选择…' : '选择元素' }}
      </button>
      <button
        class="primary"
        type="button"
        :disabled="busy || !selected"
        @click="save"
      >
        {{ busy ? '处理中…' : '导出 HTML' }}
      </button>
    </div>
    <p class="status" role="status">{{ status }}</p>
  </section>
</template>
