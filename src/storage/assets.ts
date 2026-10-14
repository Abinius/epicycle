import { validateAsset } from '../core/asset.js'
import { ASSET_DIAGNOSTICS, type Diagnostic } from '../core/diagnostic.js'
import type { FourierAsset } from '../core/types.js'

/**
 * 本地资产库（IndexedDB）。这一层只管存取，不碰资产语义——校验在 core/asset.ts，
 * 文案在 core/diagnostic.ts。
 *
 * 没有引 idb-keyval：这里要的就是 put / getAll / delete 三个动作，原生 API 包一层
 * promise 就够，省一个运行时依赖（技术文档 §6 的 storage/ 层，与 §7 选型表的差异见
 * 开发计划「M2 交付」一节）。
 */

const DB_NAME = 'fourierboard'
const DB_VERSION = 1
const STORE = 'assets'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new DOMException('IndexedDB 不可用', 'NotSupportedError'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('打不开本地资产库'))
    req.onblocked = () => reject(new Error('本地资产库被另一个标签页占着'))
  })
}

/**
 * 跑一个事务。
 * - 结果在 `oncomplete` 才 resolve：`put` 的 onsuccess 早于落盘，提前返回会在真正
 *   写失败时骗过调用方。
 * - 用完就关连接，不缓存：版本升级时旧连接会把 upgrade 卡住。
 */
async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode)
      let result!: T
      const req = run(t.objectStore(STORE))
      req.onsuccess = () => {
        result = req.result
      }
      t.oncomplete = () => resolve(result)
      t.onabort = () => reject(t.error ?? new Error('本地资产库事务中断'))
      t.onerror = () => reject(t.error ?? new Error('本地资产库事务出错'))
    })
  } finally {
    db.close()
  }
}

export interface AssetList {
  assets: FourierAsset[]
  /** 读不出结构的条数：只跳过、不删除，交给用户自己决定 */
  corrupt: number
}

/** 全部资产，新的在前。created_at 是 ISO8601，字典序即时间序 */
export async function listAssets(): Promise<AssetList> {
  const all = await tx<unknown[]>('readonly', (s) => s.getAll())
  const assets: FourierAsset[] = []
  let corrupt = 0
  for (const raw of all) {
    const parsed = validateAsset(raw)
    if (parsed.ok) assets.push(parsed.asset)
    else corrupt++
  }
  assets.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return { assets, corrupt }
}

export async function saveAsset(asset: FourierAsset): Promise<void> {
  await tx('readwrite', (s) => s.put(asset))
}

export async function deleteAsset(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}

/** 存储异常 → 诊断：配额满要「删旧资产」，其余一律是「这儿根本不让写」 */
export function storageDiagnostic(err: unknown): Diagnostic {
  const name = err instanceof DOMException ? err.name : ''
  return name === 'QuotaExceededError' ? ASSET_DIAGNOSTICS.storageFull : ASSET_DIAGNOSTICS.storageUnavailable
}
