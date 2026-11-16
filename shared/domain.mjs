/**
 * 题材领域引擎（前后端同构）
 *
 * 这里定义的是业务内核，不是数据源适配层：
 *   Subject / Stock / LimitUpLadder / Lead / Sustain / Quadrant / Rotation
 * 所有派生指标都由成分股行情实时计算，不用写死的展示数据。
 * 换真实数据源时只需替换 createInitialState / advance 的行情输入，
 * derive* 与 toSnapshot 的契约保持不变。
 */

export const SUBJECT_DEFS = [
  { id: 'SUB01', name: '示例·固态电池', bias: 0.62, sector: '新能源' },
  { id: 'SUB02', name: '示例·低空经济', bias: 0.55, sector: '高端制造' },
  { id: 'SUB03', name: '示例·算力租赁', bias: 0.72, sector: 'TMT' },
  { id: 'SUB04', name: '示例·机器人减速器', bias: 0.48, sector: '高端制造' },
  { id: 'SUB05', name: '示例·数据要素', bias: 0.44, sector: 'TMT' },
  { id: 'SUB06', name: '示例·创新药出海', bias: 0.38, sector: '医药' },
  { id: 'SUB07', name: '示例·光模块', bias: 0.66, sector: 'TMT' },
  { id: 'SUB08', name: '示例·海风装备', bias: 0.31, sector: '新能源' },
  { id: 'SUB09', name: '示例·智能驾驶', bias: 0.51, sector: '高端制造' },
  { id: 'SUB10', name: '示例·半导体设备', bias: 0.58, sector: 'TMT' },
  { id: 'SUB11', name: '示例·卫星互联网', bias: 0.35, sector: '高端制造' },
  { id: 'SUB12', name: '示例·消费电子', bias: 0.40, sector: '消费' }
]

const NAME_A = ['华', '科', '恒', '瑞', '中', '新', '东', '南']
const NAME_B = ['源', '芯', '航', '电', '材', '讯', '控', '能']

const SUBJECT_IDS = SUBJECT_DEFS.map((s) => s.id)

/** 用确定性随机分配初始连板高度，涨停率约 1/3，贴近题材股池而非全市场 */
function streakFromCode(code) {
  const roll = seeded(hash(code))()
  return roll > 0.96 ? 5 : roll > 0.93 ? 4 : roll > 0.89 ? 3 : roll > 0.84 ? 2 : roll > 0.74 ? 1 : 0
}

export const STOCK_DEFS = Array.from({ length: 48 }, (_, i) => {
  const idx = i + 1
  const code = `MKT${String(idx).padStart(3, '0')}`
  const primary = SUBJECT_IDS[i % SUBJECT_IDS.length]
  const secondary = SUBJECT_IDS[(i * 5 + 3) % SUBJECT_IDS.length]
  const tertiary = SUBJECT_IDS[(i * 7 + 5) % SUBJECT_IDS.length]
  return {
    code,
    name: `示例${NAME_A[i % 8]}${NAME_B[Math.floor(i / 8) % 8]}`,
    subjectIds: [...new Set([primary, secondary, tertiary])],
    base: 12 + ((i * 7.31) % 78),
    initialStreak: streakFromCode(code),
    sealMinutes: 9 * 60 + 30 + ((i * 13) % 95)
  }
})

const LIMIT_UP_PCT = 9.8
const TICKS_PER_DAY = 20
const HISTORY_DAYS = 20
const TURNOVER_REF = 6000000000

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n
const median = (arr) => {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function rand(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0
  return state.rng / 4294967296
}

function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return Math.abs(h)
}

function seeded(seed) {
  let v = seed >>> 0
  return () => {
    v = (Math.imul(v, 1664525) + 1013904223) >>> 0
    return v / 4294967296
  }
}

/** 构造一份可运行的初始状态；真实数据源接入时替换这里即可 */
export function createInitialState(seed = 20261115) {
  const state = {
    rng: seed >>> 0,
    day: HISTORY_DAYS,
    tick: 0,
    // 题材定义可被外部数据源替换（live 模式用真实概念），默认用内置演示题材
    subjectDefs: SUBJECT_DEFS.map((s) => ({ ...s })),
    stocks: {},
    flow: {},
    history: []
  }

  // 资金流向：与涨跌不完全同步的独立维度，让热度/象限分布更接近真实题材轮动
  for (const s of SUBJECT_DEFS) state.flow[s.id] = 0.25 + rand(state) * 0.55

  for (const def of STOCK_DEFS) {
    const streak = def.initialStreak
    const isLimitUp = streak > 0
    const price = isLimitUp
      ? round(def.base * (1 + LIMIT_UP_PCT / 100))
      : round(def.base * (1 + (rand(state) - 0.5) * 0.06))
    state.stocks[def.code] = {
      code: def.code,
      name: def.name,
      subjectIds: def.subjectIds,
      base: def.base,
      prevClose: round(def.base),
      price,
      changePct: round(((price - def.base) / def.base) * 100),
      limitUpStreak: streak,
      firstSealAt: isLimitUp ? def.sealMinutes : null,
      sealAmount: isLimitUp ? Math.round(2e7 + rand(state) * 9e7) : 0,
      turnover: Math.round(1.2e8 + rand(state) * 6e8),
      leadCount: streak >= 3 ? 2 : streak >= 2 ? 1 : 0
    }
  }

  // 预生成 20 个交易日的题材热度历史，让轮动日历/持续天数一打开就有内容
  const rng = seeded(seed ^ 0x5f3759df)
  for (let d = 1; d <= HISTORY_DAYS; d++) {
    const row = { day: d, date: dateFromDay(d), subjects: {} }
    SUBJECT_DEFS.forEach((s, i) => {
      const wave = Math.sin((d + i * 2.7) / 3.1) * 22
      const drift = (d / HISTORY_DAYS) * s.bias * 16
      const noise = (rng() - 0.5) * 16
      const heat = round(clamp(38 + wave + drift + noise, 3, 99), 1)
      row.subjects[s.id] = {
        heat,
        changePct: round((rng() - 0.44) * 7, 2),
        limitUpCount: Math.floor(rng() * 5)
      }
    })
    state.history.push(row)
  }

  // 让模拟历史的最后一天与实时引擎算出的热度衔接，避免首屏阶段判定跳变
  const live = deriveSubjects(state)
  const lastRow = state.history[state.history.length - 1]
  for (const s of live) {
    lastRow.subjects[s.subjectId] = {
      heat: s.heat,
      changePct: s.changePct,
      limitUpCount: s.limitUpCount,
      limitUpHeight: s.limitUpHeight,
      leadStock: s.leadStock?.code || null
    }
  }
  return state
}

function dateFromDay(day) {
  const start = new Date(Date.UTC(2026, 9, 19))
  start.setUTCDate(start.getUTCDate() + day)
  return start.toISOString().slice(0, 10)
}

/** 推进一个 tick：价格游走、封板/开板、成交额；满 TICKS_PER_DAY 个 tick 换日并写历史 */
export function advance(state) {
  state.tick += 1
  for (const code of Object.keys(state.stocks)) {
    const s = state.stocks[code]
    const wasLimitUp = s.limitUpStreak > 0
    if (wasLimitUp) {
      // 日内封板：价格锁定在涨停价，只有封单额波动；开板只在换日判定
      s.price = round(s.prevClose * (1 + LIMIT_UP_PCT / 100))
      s.sealAmount = Math.max(0, Math.round(s.sealAmount + (rand(state) - 0.45) * 8e6))
    } else {
      const drift = (rand(state) - 0.485) * s.base * 0.011
      s.price = round(Math.max(0.5, s.price + drift))
    }
    s.turnover += Math.round(rand(state) * 9e6)
    s.changePct = round(((s.price - s.prevClose) / s.prevClose) * 100)
  }

  for (const id of SUBJECT_IDS) {
    state.flow[id] = clamp(state.flow[id] + (rand(state) - 0.5) * 0.09, 0.05, 0.98)
  }

  if (state.tick % TICKS_PER_DAY === 0) rollDay(state)
  return state
}

function rollDay(state) {
  const derived = deriveSubjects(state)
  const row = { day: state.day + 1, date: dateFromDay(state.day + 1), subjects: {} }
  for (const s of derived) {
    row.subjects[s.subjectId] = {
      heat: s.heat,
      changePct: s.changePct,
      limitUpCount: s.limitUpCount,
      limitUpHeight: s.limitUpHeight,
      leadStock: s.leadStock?.code || null
    }
  }
  state.history.push(row)
  if (state.history.length > 40) state.history.shift()
  state.day += 1

  // 换日：部分股票开板、部分新涨停，连板梯队随之变化
  for (const code of Object.keys(state.stocks)) {
    const s = state.stocks[code]
    s.prevClose = s.price
    const r = rand(state)
    if (s.limitUpStreak > 0) {
      if (r < 0.28) {
        s.limitUpStreak = 0
        s.firstSealAt = null
        s.sealAmount = 0
        s.price = round(s.price * (0.97 + rand(state) * 0.02))
        s.changePct = round(((s.price - s.prevClose) / s.prevClose) * 100)
      } else {
        s.limitUpStreak = Math.min(7, s.limitUpStreak + 1)
        s.leadCount += s.limitUpStreak >= 3 ? 1 : 0
      }
    } else if (r < 0.12) {
      s.limitUpStreak = 1
      s.firstSealAt = 9 * 60 + 30 + Math.floor(rand(state) * 100)
      s.sealAmount = Math.round(2e7 + rand(state) * 9e7)
      s.price = round(s.prevClose * (1 + LIMIT_UP_PCT / 100))
      s.changePct = round(LIMIT_UP_PCT + rand(state) * 0.2)
    }
  }
}

/** 核心：从成分股行情派生题材的全部指标 */
export function subjectDefsOf(state) {
  return Array.isArray(state?.subjectDefs) && state.subjectDefs.length ? state.subjectDefs : SUBJECT_DEFS
}

export function deriveSubjects(state) {
  const stocks = Object.values(state.stocks)
  const prevRow = state.history[state.history.length - 1]
  return subjectDefsOf(state).map((def) => {
    const members = stocks.filter((s) => s.subjectIds.includes(def.id))
    const totalTurnover = members.reduce((n, s) => n + (s.turnover || 0), 0)
    // 竞价阶段成交额可能为 0：有成交额时按额加权，否则退化为等权平均
    const changePct = totalTurnover > 0
      ? round(members.reduce((n, s) => n + (s.changePct || 0) * ((s.turnover || 0) / totalTurnover), 0))
      : round(members.reduce((n, s) => n + (s.changePct || 0), 0) / (members.length || 1))
    const limitUpCount = members.filter((s) => s.limitUpStreak > 0).length
    const limitUpHeight = Math.max(0, ...members.map((s) => s.limitUpStreak))
    const limitUpTimesCount = members.filter((s) => s.limitUpStreak >= 2).length

    const rawHeat =
      0.24 * clamp(limitUpCount / 6) +
      0.12 * clamp((changePct + 2) / 9) +
      0.16 * clamp(totalTurnover / TURNOVER_REF) +
      0.18 * clamp(limitUpHeight / 5) +
      0.30 * clamp(state.flow[def.id] ?? 0.5)
    const heat = round(rawHeat * 100, 1)

    const leadStock = [...members].sort((a, b) =>
      b.limitUpStreak - a.limitUpStreak ||
      (a.firstSealAt ?? 9999) - (b.firstSealAt ?? 9999) ||
      b.turnover - a.turnover
    )[0]

    const prevHeat = prevRow?.subjects?.[def.id]?.heat ?? heat
    const delta = round(heat - prevHeat, 1)
    const history = state.history.map((row) => row.subjects[def.id]?.heat ?? 0)
    const trend = history.slice(-16)
    let sustainDays = 0
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i] >= 55) sustainDays++
      else break
    }
    const leadTimes = state.history.reduce((n, row) => {
      const heats = Object.values(row.subjects).map((v) => v.heat)
      return n + (row.subjects[def.id]?.heat === Math.max(...heats) ? 1 : 0)
    }, 0)

    let stage = '萌芽'
    if (limitUpHeight >= 4 && delta > 1.5 && limitUpCount >= 2) stage = '加速'
    else if (delta > 2 && limitUpCount >= 2) stage = '发酵'
    else if (delta < -5 && limitUpCount <= 2 && limitUpHeight <= 2) stage = '退潮'
    else if (heat >= 55 && delta < 0.5) stage = '分歧'
    else if (sustainDays >= 3 && heat >= 55) stage = '主线'

    return {
      subjectId: def.id,
      subjectName: def.name,
      sector: def.sector,
      subjectType: heat >= 62 && sustainDays >= 3 ? '主线题材' : '普通题材',
      changePct,
      heat,
      heatDelta: delta,
      limitUpCount,
      limitUpHeight,
      limitUpTimesCount,
      memberCount: members.length,
      turnover: totalTurnover,
      leadStock: leadStock ? {
        code: leadStock.code, name: leadStock.name, price: leadStock.price,
        changePct: leadStock.changePct, limitUpStreak: leadStock.limitUpStreak
      } : null,
      leadTimes,
      sustainDays,
      trend,
      stage
    }
  }).sort((a, b) => b.heat - a.heat)
}

/** 连板梯队：按连板高度分组 */
export function deriveLadder(state, subjectId) {
  const members = Object.values(state.stocks).filter((s) => s.subjectIds.includes(subjectId))
  const groups = {}
  for (const s of members) {
    if (s.limitUpStreak <= 0) continue
    const key = `${s.limitUpStreak}板`
    ;(groups[key] ||= []).push({
      code: s.code, name: s.name, price: s.price, changePct: s.changePct,
      limitUpStreak: s.limitUpStreak,
      firstSealAt: s.firstSealAt,
      sealAmount: s.sealAmount,
      turnover: s.turnover,
      isLead: false
    })
  }
  const all = Object.values(groups).flat().sort((a, b) => b.limitUpStreak - a.limitUpStreak || a.firstSealAt - b.firstSealAt)
  if (all[0]) all[0].isLead = true
  return {
    subjectId,
    tiers: Object.keys(groups).sort((a, b) => parseInt(b) - parseInt(a)).map((key) => ({ key, stocks: groups[key] })),
    highest: Math.max(0, ...all.map((s) => s.limitUpStreak)),
    total: all.length
  }
}

/** 全市场连板梯队（不限题材，用于题材内无连板时的兜底视图） */
export function deriveMarketLadder(state) {
  const list = Object.values(state.stocks)
    .filter((s) => s.limitUpStreak > 0)
    .map((s) => ({
      code: s.code, name: s.name, price: s.price, changePct: s.changePct,
      limitUpStreak: s.limitUpStreak, firstSealAt: s.firstSealAt,
      sealAmount: s.sealAmount, subjectIds: s.subjectIds || []
    }))
    .sort((a, b) => b.limitUpStreak - a.limitUpStreak || a.code.localeCompare(b.code))
  const groups = {}
  for (const s of list) (groups[`${s.limitUpStreak}板`] ||= []).push(s)
  return {
    total: list.length,
    highest: Math.max(0, ...list.map((s) => s.limitUpStreak)),
    tiers: Object.keys(groups)
      .sort((a, b) => parseInt(b) - parseInt(a))
      .map((key) => ({ key, stocks: groups[key] }))
  }
}

/**
 * 题材父子层级：按 sector 归并为父级，父级指标由子题材成分股并集派生
 * 返回按热度排序的父级数组，每项带 children（子题材完整指标）
 */
export function deriveSubjectTree(state) {
  const leaves = deriveSubjects(state)
  const groups = new Map()
  for (const leaf of leaves) {
    const key = leaf.sector || '其他'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(leaf)
  }

  return [...groups.entries()].map(([sector, children]) => {
    const childIds = new Set(children.map((c) => c.subjectId))
    const stocks = Object.values(state.stocks).filter((s) => s.subjectIds?.some((id) => childIds.has(id)))
    const turnoverSum = stocks.reduce((n, s) => n + (s.turnover || 0), 0)
    const changePct = turnoverSum > 0
      ? round(stocks.reduce((n, s) => n + (s.changePct || 0) * ((s.turnover || 0) / turnoverSum), 0))
      : round(stocks.reduce((n, s) => n + (s.changePct || 0), 0) / (stocks.length || 1))
    const limitUpCount = stocks.filter((s) => s.limitUpStreak > 0).length
    const limitUpHeight = Math.max(0, ...stocks.map((s) => s.limitUpStreak))
    const heat = round(children.reduce((n, c) => n + c.heat, 0) / (children.length || 1), 1)
    const lead = [...children].sort((a, b) =>
      (b.leadStock?.limitUpStreak || 0) - (a.leadStock?.limitUpStreak || 0) || b.heat - a.heat
    )[0]

    return {
      groupId: `G:${sector}`,
      groupName: sector,
      childIds: children.map((c) => c.subjectId),
      childCount: children.length,
      heat,
      changePct,
      limitUpCount,
      limitUpHeight,
      memberCount: stocks.length,
      turnover: turnoverSum,
      leadStock: lead?.leadStock || null,
      children
    }
  }).sort((a, b) => b.heat - a.heat)
}

/**
 * 事件流：对比前后两份快照，产出可展示的题材事件
 * 这是真实行情派生的事件，不是资讯
 */
export function detectEvents(prev, next) {
  if (!prev || !Array.isArray(prev.subjects) || !Array.isArray(next?.subjects)) return []
  const prevById = new Map(prev.subjects.map((s) => [s.subjectId, s]))
  const prevRank = new Map([...prev.subjects].sort((a, b) => b.heat - a.heat).map((s, i) => [s.subjectId, i]))
  const nextRank = new Map([...next.subjects].sort((a, b) => b.heat - a.heat).map((s, i) => [s.subjectId, i]))
  const events = []

  for (const s of next.subjects) {
    const p = prevById.get(s.subjectId)
    if (!p) continue

    const lead = s.leadStock?.name || '—'
    const pct = `${s.changePct > 0 ? '+' : ''}${round(s.changePct, 2)}%`

    if (p.stage !== s.stage) {
      events.push({
        type: 'stage',
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        title: `【驱动因素：${s.subjectName}进入${s.stage}阶段】`,
        body: `板块热度由 ${p.heat} 升至 ${s.heat}，当前涨幅 ${pct}，涨停 ${s.limitUpCount} 家，最高 ${s.limitUpHeight} 板，龙头 ${lead}。`,
        text: `阶段切换 ${p.stage} → ${s.stage}，热度 ${p.heat} → ${s.heat}`,
        tone: s.stage === '加速' || s.stage === '发酵' ? 'up' : s.stage === '退潮' ? 'down' : ''
      })
    }
    if (s.limitUpCount > p.limitUpCount) {
      events.push({
        type: 'limitup',
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        title: `【驱动事件：${s.subjectName}涨停家数增至 ${s.limitUpCount} 家】`,
        body: `板块内 ${s.limitUpCount} 只个股封板，最高 ${s.limitUpHeight} 板，龙头 ${lead}，板块涨幅 ${pct}，热度 ${s.heat}。`,
        text: `涨停 ${p.limitUpCount} → ${s.limitUpCount} 家，最高 ${s.limitUpHeight} 板`,
        tone: 'up'
      })
    }
    if (s.limitUpHeight > p.limitUpHeight) {
      events.push({
        type: 'ladder',
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        title: `【驱动因素：${s.subjectName}梯队晋级至 ${s.limitUpHeight} 板】`,
        body: `龙头 ${lead} 连板高度由 ${p.limitUpHeight} 板升至 ${s.limitUpHeight} 板，板块内涨停 ${s.limitUpCount} 家，涨幅 ${pct}。`,
        text: `梯队晋级，最高板 ${p.limitUpHeight} → ${s.limitUpHeight}`,
        tone: 'up'
      })
    }
    if (p.leadStock?.code && s.leadStock?.code && p.leadStock.code !== s.leadStock.code) {
      events.push({
        type: 'lead',
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        title: `【驱动事件：${s.subjectName}龙头易主】`,
        body: `${s.leadStock.name} 接替 ${p.leadStock.name}，当前 ${s.leadStock.limitUpStreak || 0} 板，涨幅 ${pct}，板块热度 ${s.heat}。`,
        text: `龙头易主 ${p.leadStock.name} → ${s.leadStock.name}`,
        tone: ''
      })
    }
    if (s.heat - p.heat >= 5) {
      events.push({
        type: 'heat',
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        title: `【驱动因素：${s.subjectName}热度快速拉升】`,
        body: `板块热度由 ${p.heat} 升至 ${s.heat}（+${round(s.heat - p.heat, 1)}），涨幅 ${pct}，涨停 ${s.limitUpCount} 家，龙头 ${lead}。`,
        text: `热度拉升 ${p.heat} → ${s.heat}（+${round(s.heat - p.heat, 1)}）`,
        tone: 'up'
      })
    }
    const pr = prevRank.get(s.subjectId)
    const nr = nextRank.get(s.subjectId)
    if (pr != null && nr != null && pr > 2 && nr <= 2) {
      events.push({
        type: 'rank',
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        title: `【驱动事件：${s.subjectName}进入热度前三】`,
        body: `热度排名由第 ${pr + 1} 升至第 ${nr + 1}，当前热度 ${s.heat}，涨幅 ${pct}，涨停 ${s.limitUpCount} 家，龙头 ${lead}。`,
        text: `进入热度前三（第 ${pr + 1} → 第 ${nr + 1}）`,
        tone: 'up'
      })
    }
  }
  return events
}

/** 题材成分股实时行情 */
export function deriveSubjectStocks(state, subjectId) {
  return Object.values(state.stocks)
    .filter((s) => s.subjectIds.includes(subjectId))
    .map((s) => ({
      code: s.code, name: s.name, price: s.price, changePct: s.changePct,
      prevClose: s.prevClose, limitUpStreak: s.limitUpStreak,
      firstSealAt: s.firstSealAt, sealAmount: s.sealAmount,
      turnover: s.turnover, volume: s.turnover, leadCount: s.leadCount,
      subjectIds: s.subjectIds
    }))
    .sort((a, b) => b.limitUpStreak - a.limitUpStreak || b.changePct - a.changePct)
}

/** 热度 × 涨幅四象限 */
export function deriveQuadrants(state) {
  const subjects = deriveSubjects(state)
  const heatMid = median(subjects.map((s) => s.heat))
  const pctMid = median(subjects.map((s) => s.changePct))
  const points = subjects.map((s) => {
    const highHeat = s.heat >= heatMid
    const highPct = s.changePct >= pctMid
    const quadrant = highHeat ? (highPct ? '高热度高涨幅' : '高热度低涨幅') : (highPct ? '低热度高涨幅' : '低热度低涨幅')
    return { subjectId: s.subjectId, subjectName: s.subjectName, x: s.heat, y: s.changePct, stage: s.stage, quadrant }
  })
  return {
    heatMid: round(heatMid, 1), pctMid: round(pctMid, 2), points,
    counts: ['高热度高涨幅', '高热度低涨幅', '低热度高涨幅', '低热度低涨幅'].map((name) => ({
      name, count: points.filter((p) => p.quadrant === name).length
    }))
  }
}

/** 轮动日历：近 N 日 × 题材热度矩阵 */
export function deriveRotation(state, days = 14) {
  const rows = state.history.slice(-days)
  const defs = subjectDefsOf(state)
  return {
    days: rows.map((r) => r.date),
    subjectIds: defs.map((s) => ({ id: s.id, name: s.name })),
    cells: defs.map((s) => ({
      subjectId: s.id,
      subjectName: s.name,
      values: rows.map((r) => r.subjects[s.id]?.heat ?? 0)
    }))
  }
}

/** 榜单：挖掘 / 涨停 / 涨幅 / 持续 / 领涨次数 */
export function deriveRankings(state) {
  const subjects = deriveSubjects(state)
  const by = (fn) => [...subjects].sort(fn).slice(0, 6).map((s) => ({
    subjectId: s.subjectId, subjectName: s.subjectName,
    heat: s.heat, heatDelta: s.heatDelta, changePct: s.changePct,
    limitUpCount: s.limitUpCount, limitUpHeight: s.limitUpHeight,
    sustainDays: s.sustainDays, leadTimes: s.leadTimes, stage: s.stage
  }))
  return {
    topDig: by((a, b) => b.heatDelta - a.heatDelta),
    topLimitUp: by((a, b) => b.limitUpCount - a.limitUpCount || b.limitUpHeight - a.limitUpHeight),
    topPctChg: by((a, b) => b.changePct - a.changePct),
    sustain: by((a, b) => b.sustainDays - a.sustainDays || b.heat - a.heat),
    topHistory: by((a, b) => b.leadTimes - a.leadTimes)
  }
}

/** 市场级指标与因子择时 */
export function deriveMarket(state) {
  const subjects = deriveSubjects(state)
  const stocks = Object.values(state.stocks)
  const limitUpTotal = stocks.filter((s) => s.limitUpStreak > 0).length
  const rising = stocks.filter((s) => s.changePct > 0).length
  const avgPct = stocks.reduce((n, s) => n + s.changePct, 0) / (stocks.length || 1)
  const heat = round(subjects.reduce((n, s) => n + s.heat, 0) / (subjects.length || 1), 1)
  const attention = round((limitUpTotal / (stocks.length || 1)) * 100, 1)
  const factor = round(clamp(0.5 + (rising / (stocks.length || 1) - 0.5) * 0.7 + avgPct / 40, 0, 1), 2)
  const series = state.history.slice(-24).map((row) => {
    const values = Object.values(row.subjects).map((v) => v.heat)
    return round(values.reduce((a, b) => a + b, 0) / (values.length || 1), 1)
  })
  const stages = ['萌芽', '发酵', '加速', '分歧', '退潮', '主线'].map((name) => ({
    name, count: subjects.filter((s) => s.stage === name).length
  }))
  return {
    heat, attention, factor,
    limitUpTotal,
    maxHeight: Math.max(0, ...stocks.map((s) => s.limitUpStreak)),
    rising, total: stocks.length, avgPct: round(avgPct, 2),
    series, stages,
    day: state.day,
    tick: state.tick
  }
}

/** 一次性产出渲染层所需的全部结构化数据 */
export function toSnapshot(state, options = {}) {
  const snapshot = {
    updatedAt: new Date().toISOString(),
    day: state.day,
    tick: state.tick,
    subjects: deriveSubjects(state),
    tree: deriveSubjectTree(state),
    ladderAll: deriveMarketLadder(state),
    quadrants: deriveQuadrants(state),
    rotation: deriveRotation(state),
    rankings: deriveRankings(state),
    market: deriveMarket(state)
  }
  // 全量股票池可能上千只：默认不下发 engine，详情由服务端按题材现算
  if (options.includeEngine !== false) {
    snapshot.engine = {
      stocks: state.stocks,
      flow: state.flow,
      day: state.day,
      tick: state.tick,
      rng: state.rng
    }
  }
  return snapshot
}

/** 个股 K 线：由历史热度与价格反推的演示日线 */
export function deriveCandles(state, code, count = 48) {
  const stock = state.stocks[code] || Object.values(state.stocks)[0]
  const rng = seeded(hash(code))
  let price = stock.base * 0.9
  const out = []
  for (let i = 0; i < count; i++) {
    const open = price
    const close = Math.max(0.5, open + (rng() - 0.47) * stock.base * 0.024)
    out.push({
      t: i,
      open: round(open),
      high: round(Math.max(open, close) + rng() * stock.base * 0.009),
      low: round(Math.min(open, close) - rng() * stock.base * 0.009),
      close: round(close),
      volume: Math.round(80000 + rng() * 160000)
    })
    price = close
  }
  const last = out[out.length - 1]
  last.close = stock.price
  last.high = Math.max(last.high, stock.price)
  last.low = Math.min(last.low, stock.price)
  return { code, name: stock.name, candles: out }
}
