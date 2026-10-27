import App from './App.vue'
import { mountPanel } from './shared'
import { widgetVisible } from './ui'

const host = mountPanel(App)

if (host) {
  const toggleWidget = () => {
    widgetVisible.value = !widgetVisible.value
    host.style.display = widgetVisible.value ? '' : 'none'
    GM_registerMenuCommand(
      widgetVisible.value ? '隐藏页面导出工具' : '显示页面导出工具',
      toggleWidget,
      { id: menuId },
    )
  }
  const menuId = GM_registerMenuCommand('隐藏页面导出工具', toggleWidget)
}
