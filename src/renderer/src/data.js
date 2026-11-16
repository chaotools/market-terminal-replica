/**
 * 数据接入层：只负责把服务端的领域快照送进界面。
 * 不生成任何本地数据——服务不可用时返回空快照，界面显示未连接状态。
 */

const BASE = 'http://127.0.0.1:8080'

export const isDesktop = () => Boolean(window.electron?.isDesktop)

export function emptySnapshot() {
  return {
    updatedAt: null,
    day: 0,
    tick: 0,
    subjects: [],
    tree: [],
    ladderAll: { tiers: [], total: 0, highest: 0 },
    quadrants: { heatMid: 0, pctMid: 0, points: [], counts: [] },
    rotation: { days: [], subjectIds: [], cells: [] },
    rankings: {},
    market: {},
    events: [],
    source: 'none',
    meta: {
      source: 'none',
      sessionState: 'unknown',
      asOf: null,
      notes: ['未连接行情源']
    }
  }
}

async function fetchJson(pathname, { port = 8080, timeout = 1500 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function loadSnapshot() {
  try {
    const data = await fetchJson('/snapshot')
    if (Array.isArray(data?.subjects)) return { ...data, source: data.meta?.source || 'none' }
  } catch { /* 服务未启动 */ }
  return emptySnapshot()
}

export async function fetchSubjectDetail(subjectId) {
  try {
    return await fetchJson(`/app/subject/query/${encodeURIComponent(subjectId)}`)
  } catch {
    return null
  }
}

/** 题材详情：由服务端按题材现算；服务不可用时返回空结果，不做本地推演 */
export async function fetchDetail(snapshot, subjectId, stockCode) {
  try {
    let data = await fetchJson(`/app/subject/query/${encodeURIComponent(subjectId)}`, { timeout: 6000 })
    if (data && data.data && typeof data.data === 'object') data = data.data
    if (data && Array.isArray(data.stocks)) {
      const code = stockCode || data.stocks[0]?.code || ''
      let candles = Array.isArray(data.candles) ? data.candles : []
      if (!candles.length) {
        try {
          const kline = await fetchJson(`/API/StockHistoryDay?code=${encodeURIComponent(code)}`, { timeout: 4000 })
          candles = kline?.candles || []
        } catch { /* 无 K 线不影响详情 */ }
      }
      return {
        ladder: data.ladder || { tiers: [], total: 0, highest: 0 },
        stocks: data.stocks,
        code,
        candles
      }
    }
  } catch { /* 服务不可用 */ }
  return { ladder: { tiers: [], total: 0, highest: 0 }, stocks: [], candles: [], code: '' }
}

/** 题材图谱：题材 → 关联题材 → 成分股 的横向树 */
export async function fetchGraph(subjectId) {
  try {
    const data = await fetchJson(`/app/subject/graph-tree/${encodeURIComponent(subjectId)}`, { timeout: 20000 })
    const payload = data?.data && typeof data.data === 'object' ? data.data : data
    return Array.isArray(payload?.tree) ? payload.tree : []
  } catch {
    return []
  }
}

export function connectStream(onSnapshot) {
  let stopped = false
  let source = null
  let retryTimer = null

  const connect = () => {
    if (stopped) return
    try {
      source = new EventSource(`${BASE}/push`)
      const handler = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (Array.isArray(data.subjects)) onSnapshot({ ...data, source: data.meta?.source || 'none' })
        } catch { /* 忽略坏帧 */ }
      }
      source.addEventListener('snapshot', handler)
      source.addEventListener('tick', handler)
      source.onerror = () => {
        source?.close()
        source = null
        onSnapshot(emptySnapshot())
        retryTimer = setTimeout(connect, 5000)
      }
    } catch {
      retryTimer = setTimeout(connect, 5000)
    }
  }

  connect()

  return () => {
    stopped = true
    source?.close()
    clearTimeout(retryTimer)
  }
}

export async function desktopInvoke(channel, payload) {
  if (!isDesktop()) return null
  try {
    return await window.electron.invoke(channel, payload)
  } catch {
    return null
  }
}

export const desktopVersion = () => desktopInvoke('getVersion')
export const desktopServiceStatus = () => desktopInvoke('getServiceStatus')
