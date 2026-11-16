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

function start(port) {
  const server = http.createServer((req, res) => {
    try {
      if (port === 8080) return handle8080(req, res)
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
