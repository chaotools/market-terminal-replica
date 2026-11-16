/**
 * Lumi 实时数据源适配层
 *
 * 职责边界：只负责「取真实行情」并映射成 shared/domain.mjs 需要的 state 结构。
 * 领域计算（热度/梯队/龙头/象限/轮动）仍由 domain 引擎完成，此处不重复实现。
 *
 * 已知能力边界（如实标注，不伪造）：
 * - 有：现价、昨收、涨跌幅、开高低、成交量、成交额、名称
 * - 有（问财）：题材成分股、截至昨日的连续涨停天数
 * - 无：封板时间、封单额、完整日线历史 → 对应字段留空，界面显示占位
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listTools, execScript, realtimeQuery } from './lumi-client.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_FILE = path.join(ROOT, 'out', 'live-universe.json')
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

// limit 为 null 表示取问财返回的全部成分股（不截断）
export const CONCEPTS = [
  { id: 'LC01', name: '固态电池', condition: '固态电池概念股', sector: '新能源', limit: null },
  { id: 'LC02', name: '算力租赁', condition: '算力租赁概念股', sector: 'TMT', limit: null },
  { id: 'LC03', name: '半导体', condition: '半导体概念股', sector: 'TMT', limit: null },
  { id: 'LC04', name: '创新药', condition: '创新药概念股', sector: '医药生物', limit: null },
  { id: 'LC05', name: '光模块', condition: '光模块概念股', sector: 'TMT', limit: null },
  { id: 'LC06', name: '数据要素', condition: '数据要素概念股', sector: 'TMT', limit: null },
  { id: 'LC07', name: '光伏', condition: '光伏概念股', sector: '新能源', limit: null },
  { id: 'LC08', name: '军工', condition: '军工概念股', sector: '国防军工', limit: null }
]

function deepUnwrap(value, depth = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 8) return value
  const keys = Object.keys(value)
  if (value.success === true && keys.length <= 2) {
    if ('result' in value) return deepUnwrap(value.result, depth + 1)
    if ('data' in value) return deepUnwrap(value.data, depth + 1)
  }
  if (keys.length === 1 && 'data' in value) return deepUnwrap(value.data, depth + 1)
  return value
}

const round2 = (value) => Math.round(value * 100) / 100

function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() && value !== 'NaN') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function limitPctOf(code) {
  if (/^(300|301|688|689)/.test(code)) return 20
  if (/^(8|4|92)/.test(code)) return 30
  return 10
}

function localNow() {
  const now = new Date()
  const shanghai = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000)
  return shanghai
}

export function sessionState() {
  const now = localNow()
  const day = now.getDay()
  if (day === 0 || day === 6) return 'closed'
  const minutes = now.getHours() * 60 + now.getMinutes()
  if (minutes >= 555 && minutes < 570) return 'auction'
  if ((minutes >= 570 && minutes <= 690) || (minutes >= 780 && minutes <= 900)) return 'open'
  if (minutes > 690 && minutes < 780) return 'lunch'
  return 'closed'
}

export function localDateString() {
  const now = localNow()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function localTimeString() {
  const now = localNow()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
}

async function ask(condition) {
  const raw = await execScript(
    'return await clientCall("smartStockSelection", { conditions: [params.condition] });',
    { condition }
  )
  const data = deepUnwrap(raw)
  return Array.isArray(data) ? data : []
}

/** 题材成分股 + 截至昨日连板，带 6 小时缓存（连板每次启动重查） */
export async function loadUniverse({ force = false, onProgress } = {}) {
  if (!force) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
      if (Date.now() - cached.savedAt < CACHE_TTL_MS && Array.isArray(cached.stocks) && cached.stocks.length) {
        // 旧缓存可能没有 sector：用概念表补齐，保证父子层级能建起来
        const sectorById = Object.fromEntries(CONCEPTS.map((c) => [c.id, c.sector]))
        cached.subjects = (cached.subjects || []).map((s) => ({
          ...s,
          sector: s.sector || sectorById[s.id] || '问财概念'
        }))
        onProgress?.('命中本地题材缓存')
        return cached
      }
    } catch { /* 无缓存 */ }
  }

  const members = new Map()
  const subjects = []
  for (const concept of CONCEPTS) {
    onProgress?.(`问财成分：${concept.name}`)
    let list = []
    try {
      list = await ask(concept.condition)
    } catch (error) {
      onProgress?.(`${concept.name} 查询失败：${error.message}`)
    }
    const picked = concept.limit ? list.slice(0, concept.limit) : list
    subjects.push({
      id: concept.id,
      name: concept.name,
      condition: concept.condition,
      sector: concept.sector || '问财概念',
      memberCount: picked.length
    })
    for (const item of picked) {
      if (!item?.code || !item?.market) continue
      const existing = members.get(item.code)
      if (existing) {
        if (!existing.subjectIds.includes(concept.id)) existing.subjectIds.push(concept.id)
      } else {
        members.set(item.code, {
          code: item.code,
          name: item.name || item.code,
          market: item.market,
          subjectIds: [concept.id]
        })
      }
    }
  }

  const streakByCode = {}
  for (const n of [6, 5, 4, 3, 2]) {
    onProgress?.(`问财连板：连续 ${n} 天`)
    try {
      const list = await ask(`连续${n}天涨停`)
      for (const item of list) {
        if (!item?.code) continue
        streakByCode[item.code] = Math.max(streakByCode[item.code] || 0, n)
      }
    } catch (error) {
      onProgress?.(`连板 ${n} 查询失败：${error.message}`)
    }
  }

  const payload = {
    savedAt: Date.now(),
    sessionState: sessionState(),
    subjects,
    stocks: [...members.values()],
    streakByCode
  }
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true })
    fs.writeFileSync(CACHE_FILE, JSON.stringify(payload, null, 2))
  } catch { /* 缓存失败不影响主流程 */ }
  return payload
}

/** 批量拉实时行情：80 只一批、4 路并发 */
export async function fetchQuotes(stocks) {
  const quotes = {}
  const batchSize = 80
  const batches = []
  for (let i = 0; i < stocks.length; i += batchSize) {
    batches.push(stocks.slice(i, i + batchSize).map((s) => ({ market: s.market, code: s.code })))
  }
  let cursor = 0
  const worker = async () => {
    while (cursor < batches.length) {
      const batch = batches[cursor++]
      try {
        const data = deepUnwrap(await realtimeQuery(batch))
        if (data && typeof data === 'object') Object.assign(quotes, data)
      } catch { /* 单批失败跳过，下一轮再补 */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, worker))
  return quotes
}

function stockFromQuote(def, quote, prev, openState, initialStreak = 0) {
  const price = num(quote?.['10'])
  const prevClose = num(quote?.['6'])
  const changePct = num(quote?.['199112'])
  const turnover = num(quote?.['19'])
  const volume = num(quote?.['13'])
  const open = num(quote?.['7'])
  const high = num(quote?.['8'])
  const low = num(quote?.['9'])
  const limit = limitPctOf(def.code)
  const isLimitUp = openState === 'open' && changePct != null && changePct >= limit * 0.98
  const yesterdayStreak = prev?.yesterdayStreak ?? initialStreak ?? 0

  let streak = 0
  if (isLimitUp) streak = Math.max(1, yesterdayStreak + 1)
  else if (openState !== 'open') streak = yesterdayStreak
  else streak = 0

  return {
    code: def.code,
    name: def.name,
    market: def.market,
    subjectIds: def.subjectIds,
    base: round2(prevClose ?? prev?.base ?? 0),
    prevClose: round2(prevClose ?? prev?.prevClose ?? 0),
    price: round2(price ?? prevClose ?? prev?.price ?? 0),
    changePct: changePct != null ? round2(changePct) : 0,
    open: open == null ? null : round2(open),
    high: high == null ? null : round2(high),
    low: low == null ? null : round2(low),
    turnover: turnover ?? prev?.turnover ?? 0,
    volume: volume ?? prev?.volume ?? 0,
    limitUpStreak: streak,
    yesterdayStreak,
    firstSealAt: prev?.firstSealAt ?? null,
    sealAmount: prev?.sealAmount ?? 0,
    leadCount: prev?.leadCount ?? 0,
    quoted: changePct != null
  }
}

export async function fetchTodayLimitUp() {
  try {
    const list = await ask('今日涨停')
    return list.filter((x) => x?.code && x?.market)
  } catch {
    return []
  }
}

export function buildState(universe, quotes, prevState, limitUpToday = []) {
  const state = {
    rng: 1,
    day: prevState?.day ?? 1,
    tick: (prevState?.tick ?? 0) + 1,
    subjectDefs: universe.subjects.map((s) => ({
      id: s.id,
      name: s.name,
      sector: s.sector || '问财概念',
      bias: 0.5,
      condition: s.condition
    })),
    stocks: {},
    flow: {},
    history: prevState?.history ?? []
  }
  const openState = sessionState()
  const flowTotals = {}

  for (const def of universe.stocks) {
    const quote = quotes[`${def.market}${def.code}`]
    const prev = prevState?.stocks?.[def.code]
    const stock = stockFromQuote(def, quote, prev, openState, universe.streakByCode?.[def.code] ?? 0)
    state.stocks[def.code] = stock
    for (const sid of def.subjectIds) {
      flowTotals[sid] = (flowTotals[sid] || 0) + (stock.turnover || 0)
    }
  }

  // 池外当日涨停股：题材池未覆盖时补进股票池，让全市场梯队不至于空窗
  for (const item of limitUpToday) {
    if (state.stocks[item.code]) {
      state.stocks[item.code].limitUpStreak = Math.max(1, state.stocks[item.code].limitUpStreak)
      continue
    }
    const extraQuote = quotes[`${item.market}${item.code}`]
    const extraPct = num(extraQuote?.['199112'])
    const extraPrice = num(extraQuote?.['10'])
    state.stocks[item.code] = {
      code: item.code,
      name: item.name || item.code,
      market: item.market,
      subjectIds: [],
      base: round2(num(extraQuote?.['6']) ?? 0),
      prevClose: round2(num(extraQuote?.['6']) ?? 0),
      price: round2(extraPrice ?? 0),
      changePct: extraPct != null ? round2(extraPct) : 0,
      turnover: num(extraQuote?.['19']) ?? 0,
      volume: num(extraQuote?.['13']) ?? 0,
      limitUpStreak: 1, yesterdayStreak: 0,
      firstSealAt: null, sealAmount: 0, leadCount: 0,
      quoted: false, offPool: true
    }
  }

  const maxFlow = Math.max(1, ...Object.values(flowTotals))
  for (const concept of universe.subjects) {
    state.flow[concept.id] = Math.min(1, (flowTotals[concept.id] || 0) / maxFlow)
  }
  return state
}

/** 把当前派生结果落成历史的一行（每日一条，用于持续天数与轮动日历） */
export function pushHistoryRow(state, deriveSubjects) {
  const subjects = deriveSubjects(state)
  const date = localDateString()
  const row = {
    day: state.day,
    date,
    subjects: {}
  }
  for (const s of subjects) {
    row.subjects[s.subjectId] = {
      heat: s.heat,
      changePct: s.changePct,
      limitUpCount: s.limitUpCount,
      limitUpHeight: s.limitUpHeight,
      leadStock: s.leadStock?.code || null
    }
  }
  const last = state.history[state.history.length - 1]
  if (last && last.date === date) state.history[state.history.length - 1] = row
  else {
    state.history.push(row)
    if (state.history.length > 40) state.history.shift()
    state.day = state.history.length
  }
}

export async function createLiveEngine({ force = false, onProgress } = {}) {
  const tools = await listTools()
  if (!Array.isArray(tools) || !tools.length) throw new Error('Lumi 未返回工具列表')
  onProgress?.(`Lumi 已连通（${tools.length} 个工具）`)

  const universe = await loadUniverse({ force, onProgress })
  const limitUpToday = sessionState() === 'open' ? await fetchTodayLimitUp() : []
  const inPool = new Set(universe.stocks.map((s) => s.code))
  const extra = limitUpToday.filter((x) => !inPool.has(x.code))
  const quotes = await fetchQuotes(extra.length ? [...universe.stocks, ...extra] : universe.stocks)
  const state = buildState(universe, quotes, null, limitUpToday)
  return {
    universe,
    state,
    lastQuotes: quotes,
    lastRefreshAt: Date.now(),
    limitUpToday,
    lastLimitUpAt: Date.now(),
    mode: 'lumi'
  }
}

export async function refreshLive(engine) {
  // 池外涨停股也补拉行情，避免连板池里出现 0% 的涨停股
  const inPool = new Set(engine.universe.stocks.map((s) => s.code))
  const extra = (engine.limitUpToday || []).filter((x) => !inPool.has(x.code))
  const targets = extra.length ? [...engine.universe.stocks, ...extra] : engine.universe.stocks
  const quotes = await fetchQuotes(targets)

  if (sessionState() === 'open' && Date.now() - (engine.lastLimitUpAt || 0) > 60000) {
    engine.limitUpToday = await fetchTodayLimitUp()
    engine.lastLimitUpAt = Date.now()
  }

  engine.state = buildState(engine.universe, quotes, engine.state, engine.limitUpToday || [])
  engine.lastQuotes = quotes
  engine.lastRefreshAt = Date.now()
  return engine.state
}

export function liveMeta(engine) {
  return {
    source: 'lumi',
    sessionState: sessionState(),
    asOf: `${localDateString()} ${localTimeString()}`,
    subjectCount: engine.universe.subjects.length,
    stockCount: engine.universe.stocks.length,
    refreshedAt: new Date(engine.lastRefreshAt).toISOString(),
    notes: [
      '题材成分来自同花顺问财概念查询',
      '连板天数取自问财“连续 N 天涨停”，口径含昨日',
      '封板时间与封单额该通道不提供，显示为占位',
      '历史热度按本机运行逐日累积'
    ]
  }
}
