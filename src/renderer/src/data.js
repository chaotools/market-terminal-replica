/**
 * 数据接入层：只负责「把领域状态送进界面」。
 * 领域计算全部在 @shared/domain.mjs，服务端与浏览器共用同一套引擎，
 * 因此替换真实数据源时界面与指标逻辑不需要改动。
 */
import * as domain from '@shared/domain.mjs'

const BASE = 'http://127.0.0.1:8080'

export const isDesktop = () => Boolean(window.electron?.isDesktop)

let localState = null
function ensureLocal() {
  if (!localState) {
    localState = domain.createInitialState(Date.now() >>> 0)
    for (let i = 0; i < 8; i++) domain.advance(localState)
  }
  return localState
}

export function localSnapshot() {
  return {
    ...domain.toSnapshot(ensureLocal()),
    events: [],
    source: 'browser',
    meta: {
      source: 'browser',
      sessionState: 'browser',
      asOf: null,
      notes: ['浏览器内领域引擎，未连接本地服务']
    }
  }
}

async function fetchJson(pathname, { port = 8080, timeout = 1400 } = {}) {
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
    if (Array.isArray(data?.subjects) && data.subjects.length) {
      return { ...data, source: data.meta?.source || 'lumi' }
    }
  } catch { /* 服务未启动 */ }
  return localSnapshot()
}

export async function fetchSubjectDetail(subjectId) {
  try {
    return await fetchJson(`/app/subject/query/${encodeURIComponent(subjectId)}`)
  } catch {
    return null
  }
}

/** 题材详情：优先由服务端按题材现算（全量成分股），服务不可用时回退本地引擎 */
export async function fetchDetail(snapshot, subjectId, stockCode) {
  if (!snapshot || snapshot.source === 'browser') return deriveDetail(snapshot, subjectId, stockCode)
  try {
    const data = await fetchJson(`/app/subject/query/${encodeURIComponent(subjectId)}`, { timeout: 6000 })
    if (data && Array.isArray(data.stocks)) {
      const code = stockCode || data.stocks[0]?.code || ''
      let candles = []
      try {
        const kline = await fetchJson(`/API/StockHistoryDay?code=${encodeURIComponent(code)}`, { timeout: 4000 })
        candles = kline?.candles || []
      } catch { /* K 线失败不影响详情 */ }
      return {
        ladder: data.ladder || { tiers: [], total: 0, highest: 0 },
        stocks: data.stocks,
        code,
        candles
      }
    }
  } catch { /* 降级 */ }
  return deriveDetail(snapshot, subjectId, stockCode)
}

/**
 * 从总览里的 engine 状态派生题材详情。
 * 用的是与服务端完全相同的 deriveLadder / deriveSubjectStocks / deriveCandles。
 */
export function deriveDetail(snapshot, subjectId, stockCode) {
  const engine = snapshot?.engine || ensureLocal()
  const stocks = domain.deriveSubjectStocks(engine, subjectId)
  const code = stockCode || stocks[0]?.code || 'MKT001'
  const kline = domain.deriveCandles(engine, code)
  return {
    ladder: domain.deriveLadder(engine, subjectId),
    stocks,
    code,
    candles: kline.candles
  }
}

export function connectStream(onSnapshot) {
  let stopped = false
  let source = null
  let timer = null

  const startFallback = () => {
    if (stopped || timer) return
    onSnapshot(localSnapshot())
    timer = setInterval(() => {
      domain.advance(ensureLocal())
      onSnapshot(localSnapshot())
    }, 1500)
  }

  if (typeof EventSource !== 'undefined') {
    try {
      source = new EventSource(`${BASE}/push`)
      const handler = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (Array.isArray(data.subjects)) onSnapshot({ ...data, source: data.meta?.source || 'lumi' })
        } catch { /* 忽略坏帧 */ }
      }
      source.addEventListener('snapshot', handler)
      source.addEventListener('tick', handler)
      source.onerror = () => {
        source?.close()
        source = null
        startFallback()
      }
    } catch {
      startFallback()
    }
  } else {
    startFallback()
  }

  return () => {
    stopped = true
    source?.close()
    if (timer) clearInterval(timer)
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
