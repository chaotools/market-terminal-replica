/**
 * 从原始应用明文抓包生成桥接 fixtures：
 *   node scripts/build-bridge-fixtures.mjs <capture-api-dir>
 * 默认读取 jyhf-analysis/screens/reference/api，输出 server/bridge-fixtures.json。
 *
 * 仅使用明文 payload；加密字符串（AES 串）不参与、不解密。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const captureDir = process.argv[2] || process.env.BRIDGE_CAPTURE_DIR ||
  'C:/Users/0409/Documents/deepseek-harness/default-workspace/jyhf-analysis/screens/reference/api'
const outFile = path.join(root, 'server', 'bridge-fixtures.json')

function load(name) {
  const raw = JSON.parse(fs.readFileSync(path.join(captureDir, name), 'utf8'))
  let body = raw.body
  try { body = JSON.parse(body) } catch { /* ciphertext or plain string */ }
  return { url: raw.url, body }
}
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const subjectNames = new Map()
const sectorHint = new Map([
  [1, '医药'], [9014348, '酒'], [9073558, '地域']
])
const NOISE_PATTERN = /盘前必读|龙虎榜|投资日历|复盘|涨停复盘|盘后|午盘/
function addSubjectNames(subjectId, name, realtimeFullName) {
  const id = Number(subjectId)
  if (!Number.isFinite(id) || !name) return
  if (NOISE_PATTERN.test(String(name))) return
  if (!subjectNames.has(id)) subjectNames.set(id, name)
  if (realtimeFullName && realtimeFullName.includes('-')) sectorHint.set(id, realtimeFullName.split('-')[0])
}

// ---- 1. 原始行情 payload ----
const indexV2 = load('_api_app_realtime_index_v2.json').body
const indexAmountRaw = load('_api_app_realtime_index-amount.json').body
const marketTime = load('_api_app_realtime_market_time.json').body
const rankRaw = load('_api_app_stock_realtime-rank_v2.json').body
const bySubjectRaw = load('_api_app_stock_realtime-by-subject_v2.json').body
const stockRealtimeRaw = load('_api_app_stock_realtime.json').body
const quoteRaw = load('_api_app_realtime_stock-realtime-data.json').body
const minuteRaw = load('_api_app_realtime_stock-minute-data.json').body
const subjectDaily1 = load('_api_app_subject_daily_1_365.json').body
const subjectDaily9073558 = load('_api_app_subject_daily_9073558_365.json').body
const subjectRealtimeAgg = load('_api_app_subject_realtime.json').body
const subjectRealtimeDetail = [
  load('_api_app_subject_realtime_1.json').body,
  load('_api_app_subject_realtime_9014348.json').body,
  load('_api_app_subject_realtime_9073558.json').body
]

// ---- 2. 题材名称：Rank 行的 subjects 数组 + 题材实时 fullName ----
const rankRows = Array.isArray(rankRaw?.rows) ? rankRaw.rows : []
const bySubjectRows = Array.isArray(bySubjectRaw?.rows) ? bySubjectRaw.rows : []
for (const row of [...rankRows, ...bySubjectRows]) {
  const subjects = Array.isArray(row?.[16]) ? row[16] : []
  for (const item of subjects) {
    if (Array.isArray(item) && item.length >= 2) addSubjectNames(item[0], item[1])
  }
}
for (const detail of subjectRealtimeDetail) {
  const data = detail?.data
  if (data && data.subjectId != null) addSubjectNames(data.subjectId, data.fullName, data.fullName)
}
for (const item of subjectRealtimeAgg?.data || []) {
  // 只有 id+pct 的题材不产生名称；名称会从 Rank/明细补全
}

// ---- 3. 个股（Rank 51 只 + 题材成分股 16 只合并） ----
const stockMap = new Map()
function addStockRow(cells) {
  if (!Array.isArray(cells) || cells.length < 18) return
  const code = String(cells[2] || '')
  if (!code) return
  const subjects = (Array.isArray(cells[16]) ? cells[16] : []).filter((x) => Array.isArray(x) && x.length >= 2)
  const pct = num(cells[10]) ?? 0
  const row = {
    code,
    name: String(cells[3] || code),
    open: num(cells[4]),
    high: num(cells[5]),
    low: num(cells[6]),
    price: num(cells[7]),
    prevClose: num(cells[8]),
    changeCount: num(cells[9]),
    changePct: pct,
    fastChg: num(cells[11]),
    volume: num(cells[12]),
    turnover: num(cells[13]),
    avprice: num(cells[14]),
    recentChange: num(cells[15]),
    turnoverRate: num(cells[17]),
    amplitude: num(cells[18]),
    marketCap: num(cells[21]),
    circulatingMarketValue: num(cells[34]),
    circulating: num(cells[35]),
    total: num(cells[36]),
    openPctChg: num(cells[37]),
    subjectIds: subjects.map((s) => Number(s[0])),
    limitUpStreak: pct >= 9.8 ? 1 : 0,
    firstSealAt: null,
    sealAmount: 0,
    leadCount: 0
  }
  const existing = stockMap.get(code)
  if (existing) {
    // 合并题材集合，保留 Rank 行字段
    existing.subjectIds = [...new Set([...(existing.subjectIds || []), ...row.subjectIds])]
    if (row.limitUpStreak > existing.limitUpStreak) existing.limitUpStreak = row.limitUpStreak
  } else {
    stockMap.set(code, row)
  }
}
for (const row of rankRows) addStockRow(row)
for (const row of bySubjectRows) addStockRow(row)
for (const item of stockRealtimeRaw?.data || []) {
  const code = String(item.stockId || '')
  if (!code) continue
  const stock = stockMap.get(code)
  if (stock) {
    if (item.current != null) stock.price = Number(item.current)
    if (item.pctChg != null) stock.changePct = Number(item.pctChg)
  } else {
    stockMap.set(code, {
      code, name: code, price: Number(item.current) || null, changePct: Number(item.pctChg) || 0,
      subjectIds: [], limitUpStreak: (Number(item.pctChg) || 0) >= 9.8 ? 1 : 0,
      firstSealAt: null, sealAmount: 0, leadCount: 0
    })
  }
}

// ---- 4. 市场宽度（最近一帧） + 指数 ----
const marketSeries = (Array.isArray(marketTime?.data) ? marketTime.data : []).slice(-120)
const latestMarket = marketSeries[marketSeries.length - 1] || {}
const indices = (Array.isArray(indexV2?.data) ? indexV2.data : []).map((item) => ({
  code: item.code,
  name: item.name,
  close: num(item.close),
  pctChg: num(item.pctChg),
  changeCount: num(item.changeCount),
  preClose: num(item.preClose),
  open: num(item.open),
  high: num(item.high),
  low: num(item.low),
  amount: num(item.amount),
  vol: num(item.vol),
  time: item.time,
  tradeDate: item.trade_date
}))
const tradeDateRaw = String(indices[0]?.tradeDate || '')
const tradeDate = tradeDateRaw.length === 8
  ? `${tradeDateRaw.slice(0, 4)}-${tradeDateRaw.slice(4, 6)}-${tradeDateRaw.slice(6, 8)}`
  : tradeDateRaw

// 涨停股（市场宽度里给出）→ 回填连板数
const limitUpList = Array.isArray(latestMarket.limitUpStock) ? latestMarket.limitUpStock : []
const limitUpCodes = new Set(limitUpList.map((s) => String(s.stockId || '')))
for (const [code, stock] of stockMap) {
  if (limitUpCodes.has(code)) stock.limitUpStreak = Math.max(1, stock.limitUpStreak || 0)
}

// 题材 pct 聚合（用于事件与题材名称补全）
const subjectAgg = new Map()
for (const stock of stockMap.values()) {
  for (const id of stock.subjectIds) {
    const item = subjectAgg.get(id) || { pctSum: 0, count: 0, stocks: [] }
    item.pctSum += Number(stock.changePct) || 0
    item.count += 1
    item.stocks.push(stock)
    subjectAgg.set(id, item)
  }
}

const subjectDefs = [...subjectNames.entries()].map(([id, name]) => ({
  id,
  name,
  sector: sectorHint.get(id) || (String(name).includes('-') ? String(name).split('-')[0] : '题材')
}))

// ---- 5. 桥接事件（由真实快照推导，不编造） ----
const events = []
limitUpList.slice(0, 12).forEach((item, index) => {
  const stock = stockMap.get(String(item.stockId || ''))
  events.push({
    id: `bridge-limitup-${index}`,
    type: 'limitup',
    subjectId: stock?.subjectIds?.[0] || '',
    subjectName: stock?.name || item.name || '',
    title: `【涨停】${item.name || item.stockId} 封板`,
    body: `${item.name || item.stockId}（${item.stockId}）涨停；市值 ${(Number(item.marketValue || 0) / 1e8).toFixed(1)} 亿；来源：原始应用市场宽度快照 ${latestMarket.time || ''}。`,
    source: '桥接·市场宽度',
    changePct: stock?.changePct ?? 10,
    tone: 'up',
    time: String(latestMarket.time || '').split(' ').pop().slice(0, 5)
  })
})
const topSubjects = [...subjectAgg.entries()]
  .map(([id, item]) => ({ id, avgPct: item.pctSum / (item.count || 1), count: item.count }))
  .sort((a, b) => b.avgPct - a.avgPct)
  .slice(0, 10)
topSubjects.forEach((item, index) => {
  const resolved = subjectNames.get(item.id)
  const name = resolved && !/^\d+$/.test(String(resolved)) ? resolved : ''
  if (!name) return
  events.push({
    id: `bridge-rank-${index}`,
    type: 'rank',
    subjectId: item.id,
    subjectName: name,
    title: `【题材异动】${name} 涨幅靠前`,
    body: `${name} 成分股 ${item.count} 只，平均涨幅 ${item.avgPct.toFixed(2)}%；来源：桥接快照题材聚合。`,
    source: '桥接·题材聚合',
    changePct: Number(item.avgPct.toFixed(2)),
    tone: item.avgPct >= 0 ? 'up' : 'down',
    time: String(latestMarket.time || '').split(' ').pop().slice(0, 5) || ''
  })
})

// 题材实时明细（明文接口 subject/realtime/:id）→ 事件
for (const detail of subjectRealtimeDetail) {
  const data = detail?.data
  if (!data || data.subjectId == null || !data.fullName) continue
  if (events.some((event) => event.subjectId === data.subjectId && event.type === 'rank')) continue
  events.push({
    id: 'bridge-rt-' + data.subjectId,
    type: 'rank',
    subjectId: data.subjectId,
    subjectName: data.fullName,
    title: '【题材实时】' + data.fullName + ' ' + (Number(data.pctChg) >= 0 ? '+' : '') + Number(data.pctChg).toFixed(2) + '%',
    body: data.fullName + ' 最新 ' + data.close + '，开 ' + data.open + ' / 高 ' + data.high + ' / 低 ' + data.low + '，成交额 ' + (Number(data.amount) / 1e8).toFixed(1) + ' 亿；来源：原文题材实时接口（明文）。',
    source: '桥接·题材实时',
    changePct: Number(data.pctChg) || 0,
    tone: Number(data.pctChg) >= 0 ? 'up' : 'down',
    time: String(data.time || '').replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2')
  })
}

// ---- 6. 题材日线 ----
function mapCandles(raw, subjectId) {
  const list = Array.isArray(raw?.data) ? raw.data : []
  return list
    .filter((item) => item && item.tradeDate)
    .map((item) => ({
      date: String(item.tradeDate).slice(0, 10),
      open: num(item.open),
      close: num(item.close),
      high: num(item.high),
      low: num(item.low),
      volume: num(item.vol),
      amount: num(item.amount),
      pctChg: num(item.pctChg)
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-120)
}
const subjectDaily = {
  1: mapCandles(subjectDaily1, 1),
  9073558: mapCandles(subjectDaily9073558, 9073558)
}

// ---- 7. 个股快照（盘口/分时） ----
const quotes = {}
if (quoteRaw?.data) quotes[String(quoteRaw.data.stockId || '300152')] = quoteRaw.data
const minutes = {}
if (minuteRaw?.data) minutes['300152'] = minuteRaw.data

const fixtures = {
  meta: {
    source: 'bridge-capture',
    generatedAt: new Date().toISOString(),
    captureDir,
    tradeDate,
    capturedMarketTime: latestMarket.time || null,
    apiFiles: fs.readdirSync(captureDir).filter((f) => f.endsWith('.json')).sort(),
    note: '由原始应用明文 API 抓包生成；加密接口不参与、未解密。数据为 2026-11-16 14:02 左右快照。'
  },
  market: {
    tradeDate,
    time: latestMarket.time || '',
    updatedAt: `${tradeDate} ${latestMarket.time || ''}`.trim(),
    upCount: num(latestMarket.upCount) ?? 0,
    downCount: num(latestMarket.downCount) ?? 0,
    limitUpCount: num(latestMarket.limitUpCount) ?? 0,
    limitDownCount: num(latestMarket.limitDownCount) ?? 0,
    limitUpHeight: num(latestMarket.limitUpHeight) ?? 0,
    red: num(latestMarket.red) ?? 0,
    green: num(latestMarket.green) ?? 0,
    yellow: num(latestMarket.yellow) ?? 0,
    blue: num(latestMarket.blue) ?? 0,
    stayCount: num(latestMarket.stayCount) ?? 0,
    amount: num(indexAmountRaw?.data?.amount) ?? null,
    addAmount: num(indexAmountRaw?.data?.addAmount) ?? null,
    indices,
    series: marketSeries.map((item) => ({
      time: item.time,
      upCount: num(item.upCount),
      downCount: num(item.downCount),
      limitUpCount: num(item.limitUpCount),
      limitDownCount: num(item.limitDownCount)
    }))
  },
  subjectDefs,
  stocks: [...stockMap.values()],
  quotes,
  minutes,
  subjectDaily,
  events
}

fs.writeFileSync(outFile, JSON.stringify(fixtures, null, 1))
const bytes = fs.statSync(outFile).size
console.log(`[bridge] wrote ${outFile}`)
console.log(`[bridge] subjects=${subjectDefs.length} stocks=${stockMap.size} events=${events.length} indices=${indices.length} bytes=${bytes}`)
console.log(`[bridge] market: ${fixtures.market.tradeDate} ${fixtures.market.time} up=${fixtures.market.upCount} down=${fixtures.market.downCount} limitUp=${fixtures.market.limitUpCount}`)
