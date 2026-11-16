/**
 * 公开行情数据源（新浪公开接口 + 东财 push2his 分时）
 *
 * 目的：给复刻版提供「全部 A 股 + 全部概念/行业板块 + 准实时行情」。
 * 与原始应用无关：不访问 app.txcfgl.com、不携带任何第三方账号、不解密任何内容。
 *
 * 能力：
 * - 全 A 股实时快照（沪深京 ~5500+ 只，新浪分页，约 2s）
 * - 概念板块 172 个 + 行业板块 49 个（新浪板块列表）
 * - 板块成分股（新浪 getHQNodeData，后台并发加载并缓存）
 * - 指数快照（上证/深证/创业板/科创50，hq.sinajs.cn）
 * - 按需：个股五档/报价（hq.sinajs.cn）、个股分时（东财 push2his，带缓存）
 *
 * 说明：板块日线没有公开免费接口，题材详情 K 线留空（不伪造）；个股分时来自东财公开接口。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const REFERER_SINA = 'https://finance.sina.com.cn/'
const QUOTE_THROTTLE_MS = 10000
const CONCEPT_TTL_MS = 30 * 60 * 1000
const MEMBER_TTL_MS = 30 * 60 * 1000
const DETAIL_CACHE_MS = 20 * 1000

const round2 = (v) => Math.round(Number(v) * 100) / 100
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const nowParts = () => {
  const now = new Date()
  const shanghai = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000)
  const pad = (n) => String(n).padStart(2, '0')
  return {
    date: `${shanghai.getFullYear()}-${pad(shanghai.getMonth() + 1)}-${pad(shanghai.getDate())}`,
    time: `${pad(shanghai.getHours())}:${pad(shanghai.getMinutes())}:${pad(shanghai.getSeconds())}`
  }
}

async function fetchText(url, { encoding = 'utf-8', referer = REFERER_SINA } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer } })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url)
  const buffer = await res.arrayBuffer()
  return new TextDecoder(encoding).decode(buffer)
}

async function fetchJson(url, options) {
  const text = await fetchText(url, options)
  return JSON.parse(text)
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      out[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return out
}

const limitPctOf = (code, name = '') => {
  // ST / *ST 股涨跌幅限制为 5%（含创业/科创板的 ST 同样为 20% 的一半 ≈ 10%，此处按主板 ST 5% 处理）
  if (/ST/i.test(String(name || ''))) {
    if (/^(300|301|688|689)/.test(String(code))) return 10
    return 5
  }
  if (/^(300|301|688|689)/.test(String(code))) return 20
  if (/^(8|4|92)/.test(String(code))) return 30
  return 10
}

/** 用「现价是否达到涨停价」判定封板，避免用涨幅阈值近似造成误判 */
const isLimitUp = (price, prevClose, code, name) => {
  const pct = limitPctOf(code, name) / 100
  if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose <= 0 || pct <= 0) return false
  // 涨停价按交易所规则四舍五入到分
  const limitPrice = Math.round(prevClose * (1 + pct) * 100) / 100
  return price >= limitPrice - 0.001
}

const mapStock = (row) => {
  const code = String(row.code || '').trim()
  const pct = num(row.changepercent) ?? 0
  return {
    code,
    name: String(row.name || code),
    price: num(row.trade),
    changePct: pct,
    changeCount: num(row.pricechange),
    open: num(row.open),
    high: num(row.high),
    low: num(row.low),
    prevClose: num(row.settlement),
    volume: num(row.volume),
    turnover: num(row.amount),
    turnoverRate: num(row.turnoverratio),
    pe: num(row.per),
    peDynamic: num(row.per),
    pb: num(row.pb),
    totalMarketValue: num(row.mktcap) != null ? num(row.mktcap) * 10000 : null,
    marketCap: num(row.mktcap) != null ? num(row.mktcap) * 10000 : null,
    circulatingMarketValue: num(row.nmc) != null ? num(row.nmc) * 10000 : null,
    circulating: num(row.nmc) != null ? num(row.nmc) * 10000 : null,
    volumeRatio: null,
    fastChg: null,
    industry: '',
    conceptNames: [],
    subjectIds: [],
    // 公开源无跨日历史：这里只能标记「今日是否封板」（0/1），连板天数需由演示源提供
    limitUpStreak: isLimitUp(num(row.trade), num(row.settlement), code, String(row.name || '')) ? 1 : 0,
    firstSealAt: null,
    sealAmount: 0,
    leadCount: 0
  }
}

const parseSinaBoards = (text, kind) => {
  const match = text.match(/=\s*(\{[\s\S]*\})/)
  if (!match) return []
  let obj
  try { obj = JSON.parse(match[1]) } catch { return [] }
  return Object.values(obj).map((csv) => {
    const parts = String(csv).split(',')
    return {
      id: parts[0],
      name: parts[1],
      count: num(parts[2]),
      close: num(parts[3]),
      changePct: num(parts[5]),
      amount: num(parts[7]),
      leadCode: String(parts[8] || '').replace(/^[a-z]{2}/, ''),
      leadChange: num(parts[9]),
      leadPrice: num(parts[10]),
      leadPct: num(parts[11]),
      leadName: parts[12] || '',
      sector: kind
    }
  }).filter((board) => board.id && board.name)
}

async function fetchIndexQuotes() {
  const text = await fetchText('https://hq.sinajs.cn/list=sh000001,sz399001,sz399006,sh000688', { encoding: 'gbk' })
  const indices = []
  for (const line of text.split('\n')) {
    const match = line.match(/hq_str_(?:sh|sz)(\d+)="([^"]*)"/)
    if (!match) continue
    const fields = match[2].split(',')
    if (fields.length < 10) continue
    const preClose = num(fields[2])
    const close = num(fields[3])
    const pctChg = preClose ? round2(((close - preClose) / preClose) * 100) : null
    indices.push({
      code: match[1],
      name: fields[0],
      open: num(fields[1]),
      preClose,
      close,
      high: num(fields[4]),
      low: num(fields[5]),
      changeCount: preClose != null && close != null ? round2(close - preClose) : null,
      pctChg,
      vol: num(fields[8]),
      amount: num(fields[9]),
      time: fields[31] || '',
      tradeDate: fields[30] || ''
    })
  }
  return indices
}

async function fetchStockHq(code) {
  const symbol = (/^(6|9|5|68)/.test(String(code)) ? 'sh' : (/^(8|4|92)/.test(String(code)) ? 'bj' : 'sz')) + code
  const text = await fetchText(`https://hq.sinajs.cn/list=${symbol}`, { encoding: 'gbk' })
  const match = text.match(/"([^"]*)"/)
  if (!match) return null
  const f = match[1].split(',')
  if (f.length < 32) return null
  const preClose = num(f[2])
  const current = num(f[3])
  const buy1 = { price: num(f[11]), volume: num(f[10]) }
  const buy2 = { price: num(f[13]), volume: num(f[12]) }
  const buy3 = { price: num(f[15]), volume: num(f[14]) }
  const buy4 = { price: num(f[17]), volume: num(f[16]) }
  const buy5 = { price: num(f[19]), volume: num(f[18]) }
  const sell1 = { price: num(f[21]), volume: num(f[20]) }
  const sell2 = { price: num(f[23]), volume: num(f[22]) }
  const sell3 = { price: num(f[25]), volume: num(f[24]) }
  const sell4 = { price: num(f[27]), volume: num(f[26]) }
  const sell5 = { price: num(f[29]), volume: num(f[28]) }
  return {
    name: f[0],
    current,
    preClose,
    open: num(f[1]),
    high: num(f[4]),
    low: num(f[5]),
    changeCount: preClose != null && current != null ? round2(current - preClose) : null,
    pctChg: preClose ? round2(((current - preClose) / preClose) * 100) : null,
    volume: num(f[8]),
    amount: num(f[9]),
    tradeFive: [
      sell1.price, sell1.volume, sell2.price, sell2.volume, sell3.price, sell3.volume, sell4.price, sell4.volume, sell5.price, sell5.volume,
      buy1.price, buy1.volume, buy2.price, buy2.volume, buy3.price, buy3.volume, buy4.price, buy4.volume, buy5.price, buy5.volume
    ],
    date: f[30],
    time: f[31]
  }
}

async function fetchStockMinute(code) {
  const market = /^(6|9|5|68)/.test(String(code)) ? '1' : '0'
  const url = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=1&iscr=0&iscca=0&secid=${market}.${code}`
  const data = await fetchJson(url, { referer: 'https://quote.eastmoney.com/' })
  const rows = Array.isArray(data?.data?.trends) ? data.data.trends : []
  const points = rows.map((row) => {
    const parts = String(row).split(',')
    const hhmm = Number(String(parts[0] || '').slice(11, 16).replace(':', '')) || 0
    return [hhmm, num(parts[2]), num(parts[5]) || 0, num(parts[7]) || 0, num(parts[3])]
  }).filter((point) => Number.isFinite(point[1]))
  return { data: points, open: num(rows[0]?.split(',')[1]), preClose: num(data?.data?.preClose) }
}

async function fetchBoardMembers(boardId) {
  const codes = []
  for (let page = 1; page <= 6; page++) {
    const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=${page}&num=100&sort=symbol&asc=1&node=${encodeURIComponent(boardId)}&symbol=&_s_r_a=page`
    let rows = []
    try { rows = await fetchJson(url) } catch { rows = [] }
    if (!Array.isArray(rows) || !rows.length) break
    for (const row of rows) {
      const code = String(row.code || '').trim()
      if (code) codes.push(code)
    }
    if (rows.length < 100) break
  }
  return codes
}

async function fetchAllStocksOnce() {
  const base = (page) => `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=${page}&num=80&sort=symbol&asc=1&node=hs_a&symbol=&_s_r_a=page`
  const rows = []
  for (let start = 1; start <= 120; start += 10) {
    const pages = Array.from({ length: 10 }, (_, i) => start + i)
    const results = await mapLimit(pages, 10, async (page) => {
      try { return await fetchJson(base(page)) } catch { return [] }
    })
    let empty = 0
    for (const arr of results) {
      if (!Array.isArray(arr) || !arr.length) { empty++; continue }
      rows.push(...arr)
    }
    if (empty >= 10) break
  }
  return rows
}

export async function createPublicEngine({ onProgress } = {}) {
  let boards = []
  let members = new Map()
  let stockList = []
  let stocks = {}
  let indices = []
  let indexAmount = null
  let state = { subjectDefs: [], stocks: {}, flow: {}, history: [], day: 0, tick: 0 }
  let meta = { source: 'public-sina', sessionState: 'live', asOf: null, notes: [] }
  let history = []
  let marketSeries = []
  let lastQuoteAt = 0
  let lastConceptsAt = 0
  let lastMembersAt = 0
  let refreshing = false
  let membersLoading = false
  let deriveSubjectsSafe = () => []
  const detailCache = new Map()

  async function refreshConcepts() {
    onProgress?.('公开源：概念/行业板块')
    const [classText, hyText] = await Promise.all([
      fetchText('https://vip.stock.finance.sina.com.cn/q/view/newFLJK.php?param=class', { encoding: 'gbk' }),
      fetchText('https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php', { encoding: 'gbk' })
    ])
    const concepts = parseSinaBoards(classText, '概念')
    const industries = parseSinaBoards(hyText, '行业')
    boards = [...concepts, ...industries]
    lastConceptsAt = Date.now()
    console.log(`[public] boards concepts=${concepts.length} industries=${industries.length}`)
  }

  async function loadAllMembers() {
    if (membersLoading) return
    membersLoading = true
    try {
      onProgress?.(`公开源：板块成分股（${boards.length} 个板块）`)
      const results = await mapLimit(boards, 16, async (board) => {
        try { return { id: board.id, codes: await fetchBoardMembers(board.id) } } catch { return { id: board.id, codes: [] } }
      })
      for (const item of results) members.set(item.id, item.codes)
      lastMembersAt = Date.now()
      rebuildState()
      console.log(`[public] members loaded: boards=${members.size} totalLinks=${results.reduce((n, r) => n + r.codes.length, 0)}`)
    } finally {
      membersLoading = false
    }
  }

  function rebuildState() {
    const subjectDefs = boards.map((board) => ({ id: board.id, name: board.name, sector: board.sector }))
    const reverse = new Map()
    for (const [subjectId, codes] of members) {
      for (const code of codes) {
        const list = reverse.get(code) || []
        list.push(subjectId)
        reverse.set(code, list)
      }
    }
    const nextStocks = {}
    for (const stock of stockList) {
      nextStocks[stock.code] = { ...stock, subjectIds: reverse.get(stock.code) || [] }
    }
    stocks = nextStocks
    const next = { subjectDefs, stocks, flow: {}, history: [], day: state.day, tick: state.tick }
    const { date } = nowParts()
    const subjects = deriveSubjectsSafe(next)
    const row = { date, subjects: Object.fromEntries(subjects.map((s) => [s.subjectId, { heat: s.heat, changePct: s.changePct }])) }
    history.push(row)
    if (history.length > 60) history = history.slice(-60)
    next.history = history
    state = next
    const upCount = stockList.filter((s) => (s.changePct || 0) > 0).length
    const downCount = stockList.filter((s) => (s.changePct || 0) < 0).length
    const limitUpCount = stockList.filter((s) => (s.limitUpStreak || 0) > 0).length
    marketSeries.push({ time: nowParts().time, upCount, downCount, limitUpCount })
    if (marketSeries.length > 240) marketSeries = marketSeries.slice(-240)
    meta = {
      ...meta,
      asOf: `${nowParts().date} ${nowParts().time}`,
      subjectCount: subjectDefs.length,
      stockCount: stockList.length,
      notes: [
        '公开行情数据源（新浪/东财公开接口，无需账号）',
        '全 A 股约 10-15 秒轮询；板块成分为公开板块成分，非厂商题材算法'
      ]
    }
  }

  async function refreshQuotes(force = false) {
    if (!force && Date.now() - lastQuoteAt < QUOTE_THROTTLE_MS) return
    onProgress?.('公开源：全 A 股行情')
    const rows = await fetchAllStocksOnce()
    stockList = rows.map(mapStock).filter((stock) => stock.code)
    lastQuoteAt = Date.now()
    state.day = nowParts().date
    state.tick = (state.tick || 0) + 1
    rebuildState()
    console.log(`[public] quotes=${stockList.length} subjects=${boards.length}`)
  }

  async function refreshIndices() {
    try {
      const next = await fetchIndexQuotes()
      if (next.length) indices = next
      indexAmount = {
        amount: indices.slice(0, 2).reduce((sum, item) => sum + (item.amount || 0), 0),
        addAmount: null
      }
    } catch (error) {
      console.error('[public] index failed:', error.message)
    }
  }

  async function refresh() {
    if (refreshing) return
    refreshing = true
    try {
      await refreshIndices()
      if (Date.now() - lastConceptsAt > CONCEPT_TTL_MS) await refreshConcepts().catch((error) => console.error('[public] concepts failed:', error.message))
      if (Date.now() - lastMembersAt > MEMBER_TTL_MS && !membersLoading) loadAllMembers().catch((error) => console.error('[public] members failed:', error.message))
      await refreshQuotes(false).catch((error) => console.error('[public] quotes failed:', error.message))
    } finally {
      refreshing = false
    }
  }

  async function init() {
    const domain = await import('../shared/domain.mjs')
    deriveSubjectsSafe = domain.deriveSubjects
    await refreshConcepts()
    await refreshIndices()
    await refreshQuotes(true)
    meta = {
      ...meta,
      asOf: `${nowParts().date} ${nowParts().time}`,
      subjectCount: boards.length,
      stockCount: stockList.length
    }
    loadAllMembers().catch((error) => console.error('[public] initial members failed:', error.message))
  }

  async function stockQuote(code) {
    const cached = detailCache.get('quote:' + code)
    if (cached && Date.now() - cached.at < DETAIL_CACHE_MS) return cached.value
    const hq = await fetchStockHq(code)
    if (!hq) return null
    const stock = stocks[code] || {}
    const limit = limitPctOf(code, hq.name || stock.name) / 100
    const value = {
      ...stock,
      stockId: code,
      code,
      name: hq.name || stock.name,
      current: hq.current,
      close: hq.current,
      preClose: hq.preClose,
      open: hq.open,
      high: hq.high,
      low: hq.low,
      changeCount: hq.changeCount,
      pctChg: hq.pctChg,
      volume: hq.volume ?? stock.volume,
      vol: hq.volume ?? stock.volume,
      amount: hq.amount ?? stock.turnover,
      tradeFive: hq.tradeFive,
      time: hq.time,
      limitUpPrice: hq.preClose ? round2(hq.preClose * (1 + limit)) : null,
      limitDownPrice: hq.preClose ? round2(hq.preClose * (1 - limit)) : null
    }
    detailCache.set('quote:' + code, { at: Date.now(), value })
    return value
  }

  async function stockMinute(code) {
    const cached = detailCache.get('minute:' + code)
    if (cached && Date.now() - cached.at < DETAIL_CACHE_MS) return cached.value
    try {
      const value = await fetchStockMinute(code)
      detailCache.set('minute:' + code, { at: Date.now(), value })
      return value
    } catch (error) {
      console.error('[public] minute failed:', code, error.message)
      return { data: [], open: 0, preClose: 0 }
    }
  }

  async function boardKline(boardId) {
    return { subjectId: boardId, name: '', candles: [] }
  }

  await init()

  return {
    get state() { return state },
    get meta() { return meta },
    get market() {
      const upCount = stockList.filter((s) => (s.changePct || 0) > 0).length
      const downCount = stockList.filter((s) => (s.changePct || 0) < 0).length
      const limitUpCount = stockList.filter((s) => (s.limitUpStreak || 0) > 0).length
      return {
        indices,
        amount: indexAmount?.amount ?? null,
        addAmount: indexAmount?.addAmount ?? null,
        tradeDate: nowParts().date,
        updatedAt: meta.asOf,
        upCount,
        downCount,
        limitUpCount,
        series: marketSeries
      }
    },
    get boards() { return boards },
    refresh,
    stockQuote,
    stockMinute,
    boardKline
  }
}
