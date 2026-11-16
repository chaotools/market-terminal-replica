import http from 'node:http'
import {
  toSnapshot, deriveLadder, deriveSubjectStocks,
  deriveRotation, deriveSubjects, detectEvents
} from '../shared/domain.mjs'
import { createLiveEngine, refreshLive, liveMeta, pushHistoryRow } from './live-source.mjs'

const PORTS = (process.env.REPLICA_PORTS || '8080,8087,8088,8886')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter(Boolean)

// 不做本地数据兜底：未连接数据源就是空状态，界面显示未连接
const emptyState = () => ({ subjectDefs: [], stocks: {}, flow: {}, history: [], day: 0, tick: 0 })

let state = emptyState()
let live = null
let meta = {
  source: 'none',
  sessionState: 'unknown',
  asOf: null,
  notes: ['未连接行情源']
}
const sseClients = new Set()
let eventLog = []
let lastAggregate = null

// 列表/推送只带聚合结果，不携带全量股票池
const aggregate = () => ({ ...toSnapshot(state, { includeEngine: false }), meta })
const snapshot = () => ({ ...aggregate(), events: eventLog.slice(-40) })

/** 对比前后两份聚合快照，产出题材事件（同题材同类型 5 分钟内去重） */
const EVENT_PRIORITY = { limitup: 6, ladder: 5, stage: 4, lead: 3, heat: 2, rank: 1 }

function recordEvents(next) {
  if (lastAggregate) {
    const now = Date.now()
    const stamp = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const date = `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}`
    const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][stamp.getDay()]
    const time = `${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`
    const pctBySubject = new Map(next.subjects.map((s) => [s.subjectId, s.changePct]))

    // 同一轮同题材只保留优先级最高的一条，避免一次跳动刷出四条
    const best = new Map()
    for (const event of detectEvents(lastAggregate, next)) {
      const current = best.get(event.subjectId)
      if (!current || (EVENT_PRIORITY[event.type] || 0) > (EVENT_PRIORITY[current.type] || 0)) {
        best.set(event.subjectId, event)
      }
    }
    for (const event of best.values()) {
      const duplicate = eventLog.find((x) =>
        x.subjectId === event.subjectId && x.type === event.type && now - x.ts < 5 * 60 * 1000)
      if (duplicate) continue
      eventLog.push({
        ...event,
        id: `${now}-${eventLog.length}`,
        ts: now,
        date,
        weekday,
        time,
        changePct: pctBySubject.get(event.subjectId) ?? 0,
        source: '本地行情引擎'
      })
    }
    if (eventLog.length > 300) eventLog = eventLog.slice(-300)
  }
  lastAggregate = next
}

async function initSource() {
  try {
    live = await createLiveEngine({
      force: process.env.REPLICA_LIVE_FORCE === '1',
      onProgress: (message) => console.log(`[live] ${message}`)
    })
    state = live.state
    meta = liveMeta(live)
    pushHistoryRow(state, deriveSubjects)
    console.log(`[source] Lumi 实时 · ${meta.subjectCount} 个题材 / ${meta.stockCount} 只成分股 · ${meta.asOf}`)
    return true
  } catch (error) {
    live = null
    state = emptyState()
    meta = {
      source: 'none',
      sessionState: 'unknown',
      asOf: null,
      error: error.message,
      notes: ['Lumi 不可用，未加载任何数据']
    }
    console.error(`[source] Lumi 不可用：${error.message}`)
    console.error('[source] 请确认同花顺 AI 客户端已启动并登录，127.0.0.1:23816 可访问')
    return false
  }
}

await initSource()
recordEvents(aggregate())
const bootAt = new Date()
const bootPad = (n) => String(n).padStart(2, '0')
eventLog.push({
  id: 'boot',
  type: 'system',
  subjectId: '',
  subjectName: '系统',
  title: '【系统：题材情报引擎启动】',
  body: `数据源 ${meta.source}，题材 ${meta.subjectCount || 0} 个，行情通道时间 ${meta.asOf || '—'}。`,
  text: `领域引擎启动 · 数据源 ${meta.source} · 题材 ${meta.subjectCount || 0} 个`,
  source: '本地引擎',
  changePct: 0,
  tone: '',
  ts: bootAt.getTime(),
  date: `${bootAt.getFullYear()}-${bootPad(bootAt.getMonth() + 1)}-${bootPad(bootAt.getDate())}`,
  weekday: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][bootAt.getDay()],
  time: `${bootPad(bootAt.getHours())}:${bootPad(bootAt.getMinutes())}`
})
const subjectById = (id) => snapshot().subjects.find((s) => s.subjectId === id) || null

function subjectDetail(id) {
  const subject = subjectById(id)
  if (!subject) return null
  return {
    ...subject,
    ladder: deriveLadder(state, id),
    stocks: deriveSubjectStocks(state, id)
  }
}

function allLadders() {
  return (state.subjectDefs || []).map((s) => ({
    subjectId: s.id,
    subjectName: s.name,
    ladder: deriveLadder(state, s.id)
  })).filter((x) => x.ladder.total > 0)
}

function limitUpStocks(minStreak = 2) {
  return Object.values(state.stocks || {})
    .filter((s) => s.limitUpStreak >= minStreak)
    .map((s) => ({
      code: s.code, name: s.name, price: s.price, changePct: s.changePct,
      limitUpStreak: s.limitUpStreak, firstSealAt: s.firstSealAt,
      sealAmount: s.sealAmount, subjectIds: s.subjectIds
    }))
    .sort((a, b) => b.limitUpStreak - a.limitUpStreak || a.firstSealAt - b.firstSealAt)
}

function json(res, body, status = 200) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store'
  })
  res.end(payload)
}

function route(pathname, query) {
  const snap = snapshot()
  const id = query.get('subjectId') || query.get('id') || ''
  const code = query.get('code') || ''
  const parts = pathname.split('/').filter(Boolean)
  const tail = parts[parts.length - 1] || ''

  // 领域总览
  if (pathname === '/snapshot' || pathname === '/') return { ...snap, service: 'local-domain-engine' }
  if (pathname === '/api/version') return { version: '0.1.0', build: 100, day: snap.day, tick: snap.tick, source: snap.meta?.source || 'none' }
  if (pathname === '/meta') return snap.meta

  // 题材列表 / 实时 / 榜单
  if (pathname === '/app/subject/list/v2') return { list: snap.subjects, total: snap.subjects.length }
  if (pathname === '/app/subject/tree') return { groups: snap.tree }
  if (pathname === '/app/subject/news') return { list: eventLog.slice(-60).reverse() }
  if (pathname === '/app/subject/realtime') return { list: snap.subjects, updatedAt: snap.updatedAt }
  if (pathname === '/app/subject/topDig') return { list: snap.rankings.topDig }
  if (pathname === '/app/subject/topLimitUp') return { list: snap.rankings.topLimitUp }
  if (pathname === '/app/subject/topPctChg') return { list: snap.rankings.topPctChg }
  if (pathname === '/app/subject/top-history') return { list: snap.rankings.topHistory }
  if (pathname === '/app/subject/sustain-subject/v2') return { list: snap.rankings.sustain }
  if (pathname === '/app/subject/lead-times' || pathname === '/app/subject/all-lead-times') {
    return { list: [...snap.subjects].sort((a, b) => b.leadTimes - a.leadTimes) }
  }
  if (pathname === '/app/subject/history-cycle/latest') return snap.rotation
  if (parts[0] === 'app' && parts[1] === 'subject' && parts[2] === 'history-cycle') return snap.rotation

  // 题材详情族
  if (parts[0] === 'app' && parts[1] === 'subject') {
    const subjectId = parts[3] || id
    if (parts[2] === 'query') return subjectDetail(subjectId)
    if (parts[2] === 'child-stock-tree') return { subjectId, stocks: deriveSubjectStocks(state, subjectId) }
    if (parts[2] === 'realtime') return subjectById(subjectId) || { error: 'not_found' }
    if (parts[2] === 'lead-days') return { subjectId, leadDays: subjectById(subjectId)?.sustainDays || 0 }
    if (parts[2] === 'stock-subject-lead') return { subjectId, leadStock: subjectById(subjectId)?.leadStock || null }
    if (parts[2] === 'daily') return { subjectId, date: tail, history: snap.rotation }
    if (parts[2] === 'parents') {
      const target = parts[3] || id
      const group = snap.tree.find((g) => g.childIds.includes(target))
      return {
        subjectId: target,
        parents: group ? [{ groupId: group.groupId, groupName: group.groupName, heat: group.heat, changePct: group.changePct }] : []
      }
    }
    if (parts[2] === 'news') {
      const target = parts[3] || id
      const list = target ? eventLog.filter((e) => e.subjectId === target) : eventLog
      return { subjectId: target || null, list: list.slice(-60).reverse() }
    }
    if (parts[2] === 'mapping') return { subjectId, stockIds: deriveSubjectStocks(state, subjectId).map((s) => s.code) }
  }

  // 连板梯队族
  if (pathname === '/app/subject-limit-up-twice/list') return { list: allLadders() }
  if (pathname === '/app/subject-limit-up-twice/calendar') return snap.rotation
  if (pathname === '/app/subject-limit-up-twice/stock-list' || pathname === '/app/subject-limit-up-twice/stock-list/v2') {
    return { list: limitUpStocks(1) }
  }

  // 精选主线 / 自选分组
  if (pathname === '/app/selected-subject/main/list/v2') {
    return { list: snap.subjects.filter((s) => s.subjectType === '主线题材' || s.heat >= 62) }
  }
  if (pathname === '/app/selected-subject/v2/stock') {
    return { list: deriveSubjectStocks(state, id || snap.subjects[0].subjectId) }
  }
  if (pathname === '/app/selected-subject/realtime') return { list: snap.subjects }
  if (pathname === '/app/self-optional/group/subject-list') {
    return { groups: [
      { name: '主线关注', subjectIds: snap.subjects.slice(0, 4).map((s) => s.subjectId) },
      { name: '异动观察', subjectIds: snap.rankings.topDig.slice(0, 4).map((s) => s.subjectId) }
    ] }
  }

  // 个股与股票池
  if (pathname === '/app/stock/realtime-by-subject/v2') return { list: deriveSubjectStocks(state, id) }
  if (pathname === '/app/stock/realtime-rank/v2') return { list: snap.subjects }
  if (pathname === '/app/stock/realtime') return { list: Object.values(state.stocks) }
  if (pathname === '/app/stock-pool/pick') return { list: limitUpStocks(1) }
  if (pathname === '/app/realtime/stock-list-by-plate') return { list: deriveSubjectStocks(state, id) }

  // 本地指标 API（对应原程序 127.0.0.1:8080 的指标端点）
  if (pathname === '/API/QuadrantCalculate') return snap.quadrants
  if (pathname === '/API/StockPlateQuadrant') return snap.quadrants
  if (pathname === '/API/MarketHeat') return { heat: snap.market.heat, series: snap.market.series.map((value, t) => ({ t, value })) }
  if (pathname === '/API/MarketAttention') return { attention: snap.market.attention, series: snap.market.series.map((value, t) => ({ t, value })) }
  if (pathname === '/API/FactorTiming') return { score: snap.market.factor, series: snap.market.series.map((value, t) => ({ t, value })) }
  // 该通道不提供日线历史：返回空序列，而不是本地生成假 K 线
  if (pathname === '/API/StockHistoryDay') return { code, candles: [], available: false }

  // 应用级
  if (pathname === '/app/config/info') {
    return {
      appName: 'Market Terminal Replica',
      domain: 'subject-rotation',
      live: Boolean(live),
      subjectCount: (state.subjectDefs || []).length
    }
  }
  if (pathname === '/app/user/info') return { loggedIn: false }
  if (pathname === '/health') return { ok: true, tick: snap.tick, day: snap.day }
  return null
}

function handle8080(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  // 本地 API 契约层：仿真原始应用 https://app.txcfgl.com/api 的响应形状
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url)
  if (url.pathname === '/push') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'access-control-allow-origin': '*'
    })
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`)
    sseClients.add(res)
    req.on('close', () => sseClients.delete(res))
    return
  }
  const result = route(url.pathname, url.searchParams)
  if (result === null) return json(res, { error: 'not_found', pathname: url.pathname }, 404)
  return json(res, result)
}

/**
 * 本地 API 契约层（仿真 app.txcfgl.com/api）。
 * 响应统一为 { code: 200, msg: 'success', data }；401 语义由前端协议层处理。
 * 原则：不伪造业务数据——行情/题材来自真实数据源（Lumi），未连接时返回空集合。
 */
function tradeDates(n, base = new Date()) {
  const days = []
  const cursor = new Date(base)
  while (days.length < n) {
    const week = cursor.getDay()
    if (week !== 0 && week !== 6) days.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() - 1)
  }
  return days
}

function apiData(pathname, query) {
  const snap = snapshot()
  const market = snap.market || {}
  const subjects = snap.subjects || []
  const stocks = Object.values(state.stocks || {})
  const parts = pathname.split('/').filter(Boolean).slice(1) // 去掉 api
  const joined = '/' + parts.join('/')
  const tail = parts[parts.length - 1] || ''

  if (joined === '/app/config/app-version') {
    return { pcVersion: 100, curVersion: 100, pcDownloadUrl: '', pcResourceUrl: '', updateContent: ['本地复刻版更新通道（不下载第三方安装包）'], pcForceUpdate: 0 }
  }
  if (joined === '/app/config/info') {
    return {
      type: '行情',
      riskInfo: '软件局限性说明:技术指标将随市场行情实时动态更新，决策时点所观测信号可能因行情演变而调整;特定交易策略仅严格适用于对应操作场景。本页面为逐项复刻演示，不构成任何投资建议。',
      sourceInfo: '数据来源说明：基于本地 API 契约 server；未连接真实行情源时为空，不伪造数据。'
    }
  }
  if (joined === '/app/ad/pc') return []
  if (joined === '/app/user/info/v2') {
    return {
      userId: 'local-demo',
      nickName: '本地复刻用户',
      avatar: '',
      phone: '',
      vip: { isVip: false, isTempVip: false, vipTime: null },
      svip: { isVip: false, isTempVip: false, svipTime: null },
      ssvip: { isVip: false },
      trainingCampVip: { isVip: false },
      pcLogincount: 0,
      pcLoginLimitCount: 1,
      unionId: ''
    }
  }
  if (parts[0] === 'trade-date' && parts[1] === 'recent') {
    return { list: tradeDates(Number(parts[2]) || 10) }
  }
  if (joined === '/app/subject/list/v2') return { list: subjects, total: subjects.length }
  if (parts[0] === 'app' && parts[1] === 'subject' && parts[2] === 'realtime' && parts[3]) {
    const subject = subjectById(parts[3])
    if (!subject) return null
    return {
      subjectId: subject.subjectId,
      fullName: subject.subjectName,
      preClose: null, open: null, high: null, low: null, close: null,
      changeCount: null, pctChg: subject.changePct, amount: subject.turnover,
      tradeDate: new Date().toISOString().slice(0, 10), time: null,
      createTime: null, subjectDailyId: null, updateBy: null, updateTime: null
    }
  }
  if (parts[0] === 'app' && parts[1] === 'subject' && parts[2] === 'query') {
    const id = parts[3] || query.get('subjectId') || ''
    return subjectDetail(id) || { error: 'not_found', subjectId: id }
  }
  if (joined === '/app/subject/realtime') return subjects.map((s) => ({ subjectId: s.subjectId, pctChg: s.changePct }))
  if (joined === '/app/stock/realtime') {
    return stocks.map((s) => ({ stockId: s.code, current: s.price, pctChg: s.changePct }))
  }
  if (joined === '/app/stock/realtime-rank/v2') {
    return { __envelope: true, rows: stockRankRows(), total: Object.keys(state.stocks || {}).length }
  }
  if (joined === '/app/stock/summary/pctChg') {
    const stocks = Object.values(state.stocks || {})
    const up = stocks.filter((s) => (s.changePct || 0) > 0).length
    const down = stocks.filter((s) => (s.changePct || 0) < 0).length
    const limitUp = stocks.filter((s) => (s.limitUpStreak || 0) > 0).length
    const limitDown = stocks.filter((s) => (s.changePct || 0) <= -9.9).length
    return { up, down, flat: Math.max(0, stocks.length - up - down), limitUp, limitDown, total: stocks.length }
  }
  if (joined === '/app/realtime/market/time') return []
  if (joined === '/app/realtime/stock-minute-data') return { data: [], open: 0, preClose: 0 }
  if (joined === '/app/realtime/index-amount') {
    return { amount: 0, addAmount: 0 }
  }
  if (joined === '/app/realtime/index/v2') return []
  if (joined === '/app/self-optional/listGroup') {
    return {
      list: [
        { groupId: 'g-main', groupName: '主线关注', objectType: 1 },
        { groupId: 'g-watch', groupName: '异动观察', objectType: 1 }
      ]
    }
  }
  if (joined === '/app/self-optional/group/stock-list') return { list: limitUpStocks(1) }
  if (joined === '/app/search/v2') {
    const keyword = String(query.get('keyword') || '').trim()
    if (!keyword) return { list: [], total: 0 }
    const hit = subjects.filter((s) => String(s.subjectName || '').includes(keyword))
    return { list: hit, total: hit.length }
  }
  if (joined === '/app/push-message/type') return [{ typeId: 1, typeName: '系统通知' }, { typeId: 2, typeName: '题材提醒' }]
  if (joined === '/app/push-message') return { rows: [], total: 0 }
  if (joined === '/app/stock/qa/v2') return { rows: [], total: 0 }
  if (joined === '/app/stock-report/v2/list') return { rows: [], total: 0 }
  if (joined === '/app/lecturer/subscribe') return { rows: [], total: 0 }
  if (joined === '/dpu/condition-stock') return { rows: [], total: 0 }
  if (joined === '/app/stock/kline/config/list') return { list: [] }
  if (joined === '/app/vip-order/' || joined === '/app/vip-order') return { rows: [], total: 0 }
  return null
}

function substances(subjects, up, down) {
  return Math.max(0, subjects.length - up - down)
}

function formatAmountShort(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return '--'
  const abs = Math.abs(n)
  if (abs >= 1e8) return (n / 1e8).toFixed(2) + '亿'
  if (abs >= 1e4) return (n / 1e4).toFixed(1) + '万'
  return String(Math.round(n))
}

/** 全部A股表格行（与原始 15 列可见口径对齐；未知列以 '--' 表示）。 */
function stockRankRows() {
  const defs = state.subjectDefs || []
  const nameOf = (id) => defs.find((d) => d.id === id)?.name || id
  const rows = Object.values(state.stocks || {}).map((s) => {
    const subj = s.subjectIds || []
    return {
      code: s.code, name: s.name, price: s.price, changePct: s.changePct,
      limitUpStreak: s.limitUpStreak, changeCount: (s.price || 0) - (s.prevClose || 0),
      subjectCount: subj.length, subjectNames: subj.slice(0, 4).map(nameOf).join('、'),
      amount: s.turnover, turnover: s.turnover,
      marketCap: s.marketCap, volume: s.volume
    }
  }).sort((a, b) => (b.changePct || 0) - (a.changePct || 0))
  return rows.map((row, index) => [
    String(index + 1), row.name, row.code,
    Number.isFinite(row.price) ? row.price.toFixed(2) : '--',
    Number.isFinite(row.changePct) ? row.changePct.toFixed(2) : '--',
    '--',
    row.limitUpStreak ? String(row.limitUpStreak) : '--',
    '--',
    Number.isFinite(row.changeCount) ? row.changeCount.toFixed(2) : '--',
    formatAmountShort(row.marketCap),
    String(row.subjectCount),
    row.subjectNames || '--',
    formatAmountShort(row.volume),
    formatAmountShort(row.amount),
    '--'
  ])
}

function handleApi(req, res, url) {
  let body = ''
  req.on('data', (chunk) => { body += chunk; if (body.length > 1_000_000) req.destroy() })
  req.on('end', () => {
    const data = apiData(url.pathname, url.searchParams)
    if (data === null) return json(res, { code: 404, msg: 'not_found', data: null })
    if (data && data.__envelope) {
      const { __envelope, ...rest } = data
      return json(res, { code: 200, msg: '操作成功', ...rest })
    }
    return json(res, { code: 200, msg: '操作成功', data })
  })
}

function start(port) {
  const server = http.createServer((req, res) => {
    try {
      if (port === PORTS[0]) return handle8080(req, res)
      if (port === 8087) return json(res, { role: 'cache', ...snapshot() })
      if (port === 8088) return json(res, { role: 'pyindex', ...snapshot().market, quadrants: snapshot().quadrants.counts })
      if (port === 8886) return json(res, { role: 'reserved', note: '预留端口，暂无服务' })
      return json(res, { error: 'unknown_port' }, 404)
    } catch (error) {
      json(res, { error: error.message }, 500)
    }
  })
  server.on('error', (error) => console.log(`[service] port ${port} error: ${error.message}`))
  server.listen(port, '127.0.0.1', () => console.log(`[service] listening on 127.0.0.1:${port}`))
}

PORTS.forEach(start)

// 全量股票池下每轮行情拉取需要数秒，刷新间隔相应放宽
const REFRESH_MS = 8000
const RETRY_MS = 30000
let lastRetryAt = 0

setInterval(async () => {
  if (!live) {
    // 数据源断开时定期重连，不做本地数据兜底
    if (Date.now() - lastRetryAt > RETRY_MS) {
      lastRetryAt = Date.now()
      await initSource()
    }
  } else {
    try {
      await refreshLive(live)
      state = live.state
      meta = liveMeta(live)
      pushHistoryRow(state, deriveSubjects)
    } catch (error) {
      meta = { ...meta, lastError: error.message, stale: true }
    }
  }
  const next = aggregate()
  recordEvents(next)
  const frame = `event: tick\ndata: ${JSON.stringify({ ...next, events: eventLog.slice(-40) })}\n\n`
  for (const client of sseClients) {
    try { client.write(frame) } catch { sseClients.delete(client) }
  }
}, REFRESH_MS).unref()

process.on('SIGTERM', () => process.exit(0))
process.on('message', (message) => {
  if (message === 'shutdown') process.exit(0)
})
console.log(`[service] 题材领域引擎已启动, 数据源=${meta.source}, 题材=${meta.subjectCount || 0}, ports=${PORTS.join(',')}`)
