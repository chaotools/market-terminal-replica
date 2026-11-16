/**
 * 统一数据访问层：复刻原始应用的协议形状。
 * - baseURL 指向本地 API 契约 server（仿真 app.txcfgl.com/api）
 * - Authorization 取自主进程 store（window.electron.sendSync('getStore')）
 * - 响应 code 缺失时走主进程 apiDecode（原为 decrypt；本地为 identity）
 * - 并发队列上限 20；401 清 token 并回登录页
 */
const BASE_URL = 'http://127.0.0.1:8080/api'
const DEFAULT_TIMEOUT = 60000
const MAX_QUEUE = 20

let active = 0
const waiting = []
let unauthorizedHandler = null

export class ApiError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

export function setUnauthorizedHandler(fn) { unauthorizedHandler = fn }

function token() {
  try {
    return window.electron?.sendSync?.('getStore', 'Authorization') || ''
  } catch { return '' }
}

function apiDecode(raw) {
  try {
    return window.electron?.sendSync?.('apiDecode', raw) ?? raw
  } catch { return raw }
}

function enqueue(task) {
  return new Promise((resolve, reject) => {
    const run = () => {
      active += 1
      task().then(resolve, reject).finally(() => {
        active -= 1
        const next = waiting.shift()
        if (next) next()
      })
    }
    if (active < MAX_QUEUE) run()
    else waiting.push(run)
  })
}

function buildQuery(params) {
  if (!params) return ''
  const parts = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) value.forEach((v) => parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`))
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  return parts.length ? '?' + parts.join('&') : ''
}

function mapNetworkError(error) {
  if (error?.name === 'AbortError') return new ApiError('请求超时，请稍后重试', 'TIMEOUT')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new ApiError('网络连接异常，请检查网络', 'OFFLINE')
  return new ApiError(`网络请求失败：${error?.message || '未知错误'}`, 'NETWORK')
}

export async function request(path, { method = 'GET', params = null, data = null, timeout = DEFAULT_TIMEOUT } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const headers = { 'Content-Type': 'application/json;charset=utf-8' }
  const auth = token()
  if (auth) headers.Authorization = auth
  try {
    const response = await enqueue(() => fetch(`${BASE_URL}${path}${buildQuery(params)}`, {
      method,
      headers,
      body: data === null ? undefined : JSON.stringify(data),
      signal: controller.signal
    }))
    const text = await response.text()
    let raw
    try { raw = text ? JSON.parse(text) : {} } catch { throw new ApiError('响应不是合法 JSON', 'BAD_JSON') }
    const payload = raw.code === undefined ? apiDecode(raw) : raw
    if (payload.code === 200) return payload.data !== undefined ? payload.data : payload
    if (payload.code === 401) {
      unauthorizedHandler?.()
      throw new ApiError(payload.msg || '登录状态已过期，请重新登录', 401)
    }
    throw new ApiError(payload.msg || `接口异常（code=${payload.code}）`, payload.code)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw mapNetworkError(error)
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  getAppVersion: () => request('/app/config/app-version'),
  getConfigInfo: (type = 1) => request('/app/config/info', { params: { type } }),
  getAds: () => request('/app/ad/pc'),
  getUserInfo: () => request('/app/user/info/v2'),
  getRecentTradeDates: (n = 10) => request(`/trade-date/recent/${n}`, { params: { platform: 'pc' } }),
  getSubjectList: () => request('/app/subject/list/v2'),
  getSubjectQuery: (subjectId) => request(`/app/subject/query/${encodeURIComponent(subjectId)}`),
  getSubjectRealtime: (params) => request('/app/subject/realtime', { method: 'POST', data: params }),
  getStockRealtime: (ids) => request('/app/stock/realtime', { method: 'POST', data: { ids } }),
  getMarketTime: () => request('/app/realtime/market/time'),
  getIndexAmount: () => request('/app/realtime/index-amount'),
  getIndexRealtime: () => request('/app/realtime/index/v2'),
  getRealtimeRank: (params) => request('/app/stock/realtime-rank/v2', { params }),
  getStockSummaryPctChg: () => request('/app/stock/summary/pctChg'),
  getStockRealtimeData: (stockId) => request('/app/realtime/stock-realtime-data', { params: { stockId } }),
  getStockMinuteData: (stockId, date) => request('/app/realtime/stock-minute-data', { params: { stockId, date } }),
  getMarketMinute: (stockId, date) => request('/app/realtime/stock-minute-data', { params: { stockId, date } }),
  getSelfOptionalGroups: (type = 1) => request('/app/self-optional/listGroup', { params: { type } }),
  getSelfOptionalStockList: (groupId) => request('/app/self-optional/group/stock-list', { params: { groupId } }),
  getSearch: (keyword) => request('/app/search/v2', { params: { keyword } }),
  getPushMessageTypes: () => request('/app/push-message/type'),
  getPushMessages: (params) => request('/app/push-message', { params })
}

export default api
