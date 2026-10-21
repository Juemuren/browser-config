import type { Component } from 'vue'
import { createApp } from 'vue'
import styles from './panel.css?inline'

export function mountPanel(component: Component): void {
  if (window.top !== window.self) return
  const host = document.createElement('div')
  host.dataset.browserExportPanel = ''
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = styles
  const mount = document.createElement('div')
  shadow.append(style, mount)
  document.documentElement.append(host)
  const app = createApp(component)
  app.mount(mount)
  window.addEventListener(
    'pagehide',
    () => {
      app.unmount()
      host.remove()
    },
    { once: true },
  )
}

export function safeFilename(value: string, fallback: string): string {
  return (
    Array.from(value.replace(/[\\/:*?"<>|]/g, '_'), (character) =>
      character.charCodeAt(0) < 32 ? '_' : character,
    )
      .join('')
      .trim()
      .slice(0, 100) || fallback
  )
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
