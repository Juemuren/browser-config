import { download, safeFilename } from '../shared'

export interface DatabaseChoice {
  name: string
  version: number
}

export async function scanDatabases(): Promise<DatabaseChoice[]> {
  if (!indexedDB.databases)
    throw new Error('浏览器不支持 indexedDB.databases()，无法枚举数据库')
  return (await indexedDB.databases())
    .filter((item): item is IDBDatabaseInfo & { name: string } =>
      Boolean(item.name),
    )
    .map((item) => ({ name: item.name, version: item.version ?? 0 }))
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB 读取失败'))
  })
}

async function readDatabase(
  name: string,
): Promise<{
  name: string
  version: number
  stores: Record<string, unknown[]>
}> {
  const db = await requestValue(indexedDB.open(name))
  try {
    const names = Array.from(db.objectStoreNames)
    const stores: Record<string, unknown[]> = {}
    if (!names.length) return { name, version: db.version, stores }
    const transaction = db.transaction(names, 'readonly')
    const finished = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('事务失败'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('事务已中止'))
    })
    for (const storeName of names) {
      const request = transaction.objectStore(storeName).getAll()
      request.onsuccess = () => {
        stores[storeName] = request.result
      }
    }
    await finished
    return { name, version: db.version, stores }
  } finally {
    db.close()
  }
}

function base64(bytes: Uint8Array): string {
  let result = ''
  for (let start = 0; start < bytes.length; start += 8192)
    result += String.fromCharCode(...bytes.subarray(start, start + 8192))
  return btoa(result)
}

async function jsonValue(
  value: unknown,
  seen = new WeakSet<object>(),
): Promise<unknown> {
  if (typeof value === 'bigint')
    return { $type: 'BigInt', value: value.toString() }
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return { $type: 'CircularReference' }
  seen.add(value)
  try {
    if (value instanceof Date)
      return { $type: 'Date', value: value.toISOString() }
    if (value instanceof Blob)
      return {
        $type: 'Blob',
        mimeType: value.type,
        base64: base64(new Uint8Array(await value.arrayBuffer())),
      }
    if (value instanceof ArrayBuffer)
      return { $type: 'ArrayBuffer', base64: base64(new Uint8Array(value)) }
    if (ArrayBuffer.isView(value))
      return {
        $type: value.constructor.name,
        base64: base64(
          new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
        ),
      }
    if (value instanceof Map)
      return {
        $type: 'Map',
        entries: await Promise.all(
          Array.from(value, async ([key, item]) => [
            await jsonValue(key, seen),
            await jsonValue(item, seen),
          ]),
        ),
      }
    if (value instanceof Set)
      return {
        $type: 'Set',
        values: await Promise.all(
          Array.from(value, (item) => jsonValue(item, seen)),
        ),
      }
    if (Array.isArray(value))
      return Promise.all(value.map((item) => jsonValue(item, seen)))
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([key, item]) => [
          key,
          await jsonValue(item, seen),
        ]),
      ),
    )
  } finally {
    seen.delete(value)
  }
}

export async function exportDatabases(
  names: string[],
  update: (message: string) => void,
): Promise<void> {
  const databases = []
  for (const [index, name] of names.entries()) {
    update(`读取数据库 ${index + 1}/${names.length}：${name}`)
    databases.push(await jsonValue(await readDatabase(name)))
  }
  const payload = {
    origin: location.origin,
    exportedAt: new Date().toISOString(),
    databases,
  }
  download(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    }),
    `${safeFilename(location.hostname, 'indexeddb')}-indexeddb.json`,
  )
}
