/**
 * 题材领域引擎（纯计算层）
 *
 * 这里只有派生逻辑，没有任何内置数据：
 * 输入 state 由数据源适配层提供（见 server/public-source.mjs / server/bridge-source.mjs），
 * 结构为 { subjectDefs, stocks, flow, history, day, tick }。
 * 数据源不可用时 state 为空对象，所有派生函数返回空结果而不是演示数据。
 */

const TURNOVER_REF = 6000000000

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n
const median = (arr) => {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function subjectDefsOf(state) {
  return Array.isArray(state?.subjectDefs) ? state.subjectDefs : []
}

/** 核心：从成分股行情派生题材的全部指标 */
export function deriveSubjects(state) {
  const stocks = Object.values(state?.stocks || {})
  const history = state?.history || []
  const flow = state?.flow || {}
  const prevRow = history[history.length - 1]

  return subjectDefsOf(state).map((def) => {
    const members = stocks.filter((s) => s.subjectIds?.includes(def.id))
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
      0.30 * clamp(flow[def.id] ?? 0.5)
    const heat = round(rawHeat * 100, 1)

    const leadStock = [...members].sort((a, b) =>
      b.limitUpStreak - a.limitUpStreak ||
      (a.firstSealAt ?? 9999) - (b.firstSealAt ?? 9999) ||
      b.turnover - a.turnover
    )[0]

    const prevHeat = prevRow?.subjects?.[def.id]?.heat ?? heat
    const delta = round(heat - prevHeat, 1)
    const heatSeries = history.map((row) => row.subjects[def.id]?.heat ?? 0)
    const trend = heatSeries.slice(-16)
    let sustainDays = 0
    for (let i = heatSeries.length - 1; i >= 0; i--) {
      if (heatSeries[i] >= 55) sustainDays++
      else break
    }
    const leadTimes = history.reduce((n, row) => {
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
  const members = Object.values(state?.stocks || {}).filter((s) => (s.subjectIds || []).some((id) => String(id) === String(subjectId)))
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
  const all = Object.values(groups).flat().sort((a, b) =>
    b.limitUpStreak - a.limitUpStreak || (a.firstSealAt ?? 9999) - (b.firstSealAt ?? 9999))
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
  const list = Object.values(state?.stocks || {})
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
    const stocks = Object.values(state?.stocks || {}).filter((s) => s.subjectIds?.some((id) => childIds.has(id)))
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
 * 题材图谱：以某题材为中心，构造「中心题材 → 关联题材 → 成分股」的横向树。
 * 关联题材按共享成分股数量（Jaccard 重合度）排序，体现原版「题材图谱」的业务语义：
 * 一只股票同时属于多个题材，题材之间因共享成分股而产生关联。
 * 节点结构与原版 HorizontalTree 对齐：subjectId / name / pctChg / children / stocks / reason / business / top。
 */
export function deriveSubjectGraph(state, subjectId, options = {}) {
  const maxRelated = options.maxRelated ?? 10
  const maxStocks = options.maxStocks ?? 6
  const sid = String(subjectId ?? '')
  if (!sid) return []

  const all = Object.values(state?.stocks || {})
  const subjects = deriveSubjects(state)
  const center = subjects.find((s) => String(s.subjectId) === sid)
  if (!center) return []

  // 中心题材成分股集合
  const centerStocks = new Set(all.filter((s) => s.subjectIds?.some((id) => String(id) === sid)).map((s) => s.code))

  // 统计其它题材与中心的共享成分股
  const related = []
  for (const sub of subjects) {
    if (String(sub.subjectId) === sid) continue
    const members = new Set(all.filter((s) => s.subjectIds?.some((id) => String(id) === String(sub.subjectId))).map((s) => s.code))
    if (!members.size) continue
    let shared = 0
    for (const code of members) if (centerStocks.has(code)) shared++
    if (!shared) continue
    const jaccard = shared / (centerStocks.size + members.size - shared || 1)
    related.push({ sub, members, shared, jaccard })
  }
  related.sort((a, b) => b.shared - a.shared || b.jaccard - a.jaccard || b.sub.heat - a.sub.heat)

  const stocksOf = (memberSet) => all
    .filter((s) => memberSet.has(s.code))
    .sort((a, b) => b.limitUpStreak - a.limitUpStreak || b.changePct - a.changePct)
    .slice(0, maxStocks)

  // 二级节点：关联题材；三级节点：该题材的龙头成分股
  const children = related.slice(0, maxRelated).map(({ sub, members, shared }) => ({
    subjectId: sub.subjectId,
    name: sub.subjectName,
    pctChg: sub.changePct,
    heat: sub.heat,
    limitUpCount: sub.limitUpCount,
    limitUpHeight: sub.limitUpHeight,
    reason: `与「${center.subjectName}」共享 ${shared} 只成分股`,
    business: sub.sector === '行业' ? 1 : 0,
    top: sub.top ? 1 : 0,
    stocks: stocksOf(members).map((s) => ({
      stockId: s.code,
      name: s.name,
      pctChg: s.changePct,
      price: s.price,
      limitUpStreak: s.limitUpStreak,
      reason: s.subjectNames || undefined,
      subjectIds: s.subjectIds
    })),
    children: []
  }))

  // 根节点：中心题材，直接挂自身成分股
  const root = {
    subjectId: center.subjectId,
    name: center.subjectName,
    pctChg: center.changePct,
    heat: center.heat,
    limitUpCount: center.limitUpCount,
    limitUpHeight: center.limitUpHeight,
    business: center.sector === '行业' ? 1 : 0,
    top: 0,
    children,
    stocks: stocksOf(centerStocks).map((s) => ({
      stockId: s.code,
      name: s.name,
      pctChg: s.changePct,
      price: s.price,
      limitUpStreak: s.limitUpStreak,
      reason: s.subjectNames || undefined,
      subjectIds: s.subjectIds
    }))
  }
  return [root]
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
  return Object.values(state?.stocks || {})
    .filter((s) => (s.subjectIds || []).some((id) => String(id) === String(subjectId)))
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
  const rows = (state?.history || []).slice(-days)
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
  const stocks = Object.values(state?.stocks || {})
  const limitUpTotal = stocks.filter((s) => s.limitUpStreak > 0).length
  const rising = stocks.filter((s) => s.changePct > 0).length
  const avgPct = stocks.reduce((n, s) => n + (s.changePct || 0), 0) / (stocks.length || 1)
  const heat = round(subjects.reduce((n, s) => n + s.heat, 0) / (subjects.length || 1), 1)
  const attention = round((limitUpTotal / (stocks.length || 1)) * 100, 1)
  const factor = round(clamp(0.5 + (rising / (stocks.length || 1) - 0.5) * 0.7 + avgPct / 40, 0, 1), 2)
  const series = (state?.history || []).slice(-24).map((row) => {
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
    day: state?.day || 0,
    tick: state?.tick || 0
  }
}

/** 一次性产出渲染层所需的全部结构化数据 */
export function toSnapshot(state, options = {}) {
  const snapshot = {
    updatedAt: new Date().toISOString(),
    day: state?.day || 0,
    tick: state?.tick || 0,
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
      stocks: state?.stocks || {},
      flow: state?.flow || {},
      day: state?.day || 0,
      tick: state?.tick || 0
    }
  }
  return snapshot
}
