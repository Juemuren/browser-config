declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, unknown>
  export default component
}

declare function GM_registerMenuCommand(
  name: string,
  callback: () => void,
  options?: { id?: string | number },
): string | number
