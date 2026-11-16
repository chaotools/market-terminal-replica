/**
 * 确定性演示数据源（开源默认模式）
 *
 * 目标：让整套题材领域引擎（连板梯队、多日轮动、阶段、事件、资金流）在没有真实行情
 * 的情况下也能完整、自洽地演示。所有数据由固定种子的伪随机序列在运行时生成，
 * 仓库里不存任何静态数据文件；同一种子每次启动得到完全相同的历史与演化。
 *
 * 与 public-source / bridge-source 接口对齐：
 *   { get state, get meta, get market, refresh, stockQuote, stockMinute, boardKline }
 *
 * 注意：这是演示数据，界面 meta.notes 会明确标注 source='demo'，不冒充真实行情。
 */

// ---- 确定性随机（mulberry32）----
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// 题材种子：名称 + 板块 + 成分股数。名字是通用行业/概念词，不含任何真实个股推荐含义。
const SUBJECT_SEEDS = [
  ['人工智能', 'TMT', 34], ['算力租赁', 'TMT', 22], ['光模块', 'TMT', 18],
  ['半导体', 'TMT', 40], ['消费电子', 'TMT', 26], ['国产软件', 'TMT', 20],
  ['数据要素', 'TMT', 30], ['游戏传媒', 'TMT', 16], ['6G通信', 'TMT', 14],
  ['机器人', '高端制造', 28], ['工业母机', '高端制造', 18], ['低空经济', '高端制造', 20],
  ['商业航天', '高端制造', 16], ['智能驾驶', '高端制造', 24], ['储能', '新能源', 30],
  ['光伏', '新能源', 34], ['固态电池', '新能源', 22], ['风电', '新能源', 18],
  ['创新药', '医药生物', 32], ['CXO', '医药生物', 20], ['医疗器械', '医药生物', 22],
  ['白酒', '消费', 18], ['食品饮料', '消费', 24], ['零售', '消费', 16],
  ['证券', '金融', 22], ['银行', '金融', 14], ['保险', '金融', 10],
  ['房地产', '周期', 26], ['有色', '周期', 28], ['煤炭', '周期', 18],
  ['化工', '周期', 30], ['钢铁', '周期', 16], ['军工', '国防', 30],
  ['农业种植', '农业', 20], ['环保', '公用', 18], ['电力', '公用', 20],
  ['国企改革', '主题', 36], ['并购重组', '主题', 28], ['高送转', '主题', 14],
  ['参股金融', '主题', 24], ['专精特新', '主题', 26], ['华为概念', '主题', 34],
  ['小米概念', '主题', 20], ['苹果概念', '主题', 22], ['特斯拉', '主题', 24],
  ['一带一路', '主题', 22], ['雄安新区', '主题', 16], ['乡村振兴', '主题', 18],
  ['碳中和', '主题', 24], ['元宇宙', '主题', 18], ['脑机接口', '主题', 12],
  ['量子科技', '主题', 12], ['可控核聚变', '主题', 10], ['稀土永磁', '周期', 18],
  ['氟化工', '周期', 14], ['液冷服务器', 'TMT', 16], ['CPO', 'TMT', 14],
  ['想象力·新质生产力', '主题', 20]
]

const CODE_PREFIX = ['60', '00', '30', '68', '002', '300']
const NAME_A = '华创中科科创宏图远见长风启明泰和汇通恒信嘉禾瑞丰鼎盛超越联创'.split('')
const NAME_B = '科技电子智能新材能源信息数据生物医药制造装备网络系统股份集团'.split('')

function makeStockName(rnd) {
  const a = NAME_A[Math.floor(rnd() * NAME_A.length)]
  const b = NAME_B[Math.floor(rnd() * NAME_B.length)]
  const b2 = NAME_B[Math.floor(rnd() * NAME_B.length)]
  return `${a}${b}${b2}`.slice(0, 4)
}

function limitPctOf(code, name) {
  if (/ST/i.test(name || '')) return 5
  if (/^(300|301|688|689)/.test(code)) return 20
  if (/^(8|4|92)/.test(code)) return 30
  return 10
}

/**
 * @param {object} opts
 * @param {number} [opts.seed=20261116] 随机种子
 * @param {number} [opts.days=14] 预生成历史交易日天数
 * @param {Function} [opts.onProgress]
 */
export async function createDemoEngine({ seed = 20261116, days = 14, onProgress } = {}) {
  const rnd = mulberry32(seed)
  onProgress?.('演示源：生成确定性题材与成分股')

  // ---- 构建题材与股票 ----
  const subjectDefs = SUBJECT_SEEDS.map(([name, sector], i) => ({ id: `D${String(i + 1).padStart(3, '0')}`, name, sector }))
  const stocks = {}
  let codeSeq = 600000
  for (let si = 0; si < SUBJECT_SEEDS.length; si++) {
    const count = SUBJECT_SEEDS[si][2]
    for (let k = 0; k < count; k++) {
      const prefix = CODE_PREFIX[Math.floor(rnd() * CODE_PREFIX.length)]
      const code = prefix + String(codeSeq++).slice(-6)
      if (stocks[code]) continue
      // 每只股票平均归属 1~3 个题材：本题材 + 可能的相邻题材
      const subjectIds = [subjectDefs[si].id]
      if (rnd() < 0.35) subjectIds.push(subjectDefs[(si + 1 + Math.floor(rnd() * 3)) % subjectDefs.length].id)
      const basePrice = round(5 + rnd() * 90, 2)
      stocks[code] = {
        code,
        name: makeStockName(rnd),
        subjectIds,
        price: basePrice,
        prevClose: basePrice,
        changePct: 0,
        open: basePrice,
        high: basePrice,
        low: basePrice,
        volume: 0,
        turnover: 0,
        turnoverRate: 0,
        limitUpStreak: 0,
        firstSealAt: null,
        sealAmount: 0,
        leadCount: 0,
        // 内部演化参数（不参与领域契约）
        _momentum: (rnd() - 0.5) * 2,
        _base: basePrice,
        _streak: 0
      }
    }
  }

  const flow = {}
  const flowBase = {}
  for (const def of subjectDefs) {
    const base = round(0.25 + rnd() * 0.5, 3) // 基准落在 0.25~0.75，避免整体爆表
    flowBase[def.id] = base
    flow[def.id] = base
  }

  // ---- 演化一日：更新股票行情 + 连板，返回该日题材 heat 快照 ----
  const { deriveSubjects } = await import('../shared/domain.mjs')
  let dayIndex = 0
  const history = []
  // 指数在 evolveDay 里推进并缓存，保证读取 market 不消耗随机数
  let indices = [
    { name: '上证指数', code: 'SH000001', price: 3200, changePct: 0, amount: 3.2e11 },
    { name: '深证成指', code: 'SZ399001', price: 10200, changePct: 0, amount: 4.1e11 }
  ]

  function evolveDay() {
    dayIndex++
    for (const code of Object.keys(stocks)) {
      const s = stocks[code]
      // 动量 + 均值回归 + 噪声
      s._momentum = clamp(s._momentum * 0.75 + (rnd() - 0.5) * 0.9 - (s.price / s._base - 1) * 0.3, -1, 1)
      let pct = s._momentum * 6 + (rnd() - 0.5) * 4
      const lim = limitPctOf(code, s.name)
      pct = clamp(pct, -lim, lim)
      // 一部分股票封板（涨停或跌停），并用连板惯性制造 2~5 板
      const sealChance = 0.06 + (s._streak > 0 ? 0.45 : 0)
      if (rnd() < sealChance) pct = rnd() < 0.82 ? lim : -lim
      s.prevClose = s.price
      s.price = round(s.prevClose * (1 + pct / 100), 2)
      s.changePct = round(pct, 2)
      s.open = round(s.prevClose * (1 + (rnd() - 0.5) * 1.5), 2)
      s.high = round(Math.max(s.price, s.open) * (1 + rnd() * 0.01), 2)
      s.low = round(Math.min(s.price, s.open) * (1 - rnd() * 0.01), 2)
      s.volume = Math.round(1e5 + rnd() * 9e6)
      s.turnover = Math.round(s.volume * s.price)
      s.turnoverRate = round(rnd() * 18, 2)
      // 连板：涨停则 streak+1，跌停或非涨停归零
      if (pct >= lim - 0.01) {
        s._streak = (s._streak || 0) + 1
        s.firstSealAt = 9 + Math.floor(rnd() * 5)
        s.sealAmount = Math.round(1e6 + rnd() * 5e7)
      } else {
        s._streak = 0
        s.firstSealAt = null
        s.sealAmount = 0
      }
      s.limitUpStreak = s._streak
      s.leadCount = s._streak >= 2 ? s._streak : 0
    }
    // 资金流围绕题材基准均值回归 + 噪声，避免随机游走漂到极端
    for (const def of subjectDefs) {
      const base = flowBase[def.id]
      flow[def.id] = round(clamp(flow[def.id] * 0.7 + base * 0.3 + (rnd() - 0.5) * 0.2, 0.05, 0.95), 3)
    }

    const date = `D-${String(dayIndex).padStart(2, '0')}`
    const stateNow = { subjectDefs, stocks, flow, history, day: dayIndex, tick: 0 }
    // 用"上一帧"作为 prev 计算当前 heat：先临时移除当前帧影响
    const subjectsNow = deriveSubjects(stateNow)
    // 指数随大盘平均涨跌推进（确定性）
    const avgChg = list_avgChangePct()
    indices = indices.map((ix) => {
      const chg = round(avgChg * 0.8 + (rnd() - 0.5) * 0.4, 2)
      return { ...ix, price: round(ix.price * (1 + chg / 100), 2), changePct: chg }
    })
    const snap = {
      date,
      subjects: Object.fromEntries(subjectsNow.map((s) => [s.subjectId, { heat: s.heat, changePct: s.changePct }]))
    }
    return snap
  }

  function list_avgChangePct() {
    const list = Object.values(stocks)
    return list.length ? list.reduce((n, s) => n + (s.changePct || 0), 0) / list.length : 0
  }

  // 预生成 N 天历史：前 N-1 天作为 history，最后一天作为"当前"
  onProgress?.(`演示源：演化 ${days} 个交易日`)
  let latestSnap = null
  for (let d = 0; d < days; d++) {
    latestSnap = evolveDay()
    if (d < days - 1) history.push(latestSnap)
  }
  if (history.length > 60) history.splice(0, history.length - 60)

  let state = { subjectDefs, stocks, flow, history: [...history], day: dayIndex, tick: 0 }
  let meta = {
    source: 'demo',
    sessionState: '演示数据',
    asOf: `演示第 ${dayIndex} 日`,
    subjectCount: subjectDefs.length,
    stockCount: Object.keys(stocks).length,
    notes: [
      '确定性演示数据源（固定种子，运行时生成，仓库不含静态数据）',
      '连板/资金流/多日轮动均为可复现的模拟演化，仅用于功能演示，非真实行情'
    ]
  }

  function rebuildState() {
    state = { subjectDefs, stocks, flow, history: [...history], day: dayIndex, tick: state.tick }
  }

  async function refresh() {
    // 演示源每次刷新推进一个交易日：把上一日快照留在 history，当前日成为新的观测帧
    onProgress?.('演示源：推进一个交易日')
    const newSnap = evolveDay()
    history.push(latestSnap)                // 上一交易日进入 history
    latestSnap = newSnap                    // 新交易日成为当前
    if (history.length > 60) history.splice(0, history.length - 60)
    state.tick++
    rebuildState()
    meta = {
      ...meta,
      asOf: `演示第 ${dayIndex} 日`,
      subjectCount: subjectDefs.length,
      stockCount: Object.keys(stocks).length
    }
  }

  // 手动跳日（供 API / 演示控制）
  async function advance(steps = 1) {
    for (let i = 0; i < steps; i++) await refresh()
  }

  async function stockQuote(code) {
    const s = stocks[code]
    if (!s) return null
    const lim = limitPctOf(code, s.name) / 100
    return {
      ...s, stockId: code,
      current: s.price, close: s.price, preClose: s.prevClose,
      pctChg: s.changePct, tradeFive: [], time: meta.asOf,
      limitUpPrice: round(s.prevClose * (1 + lim), 2),
      limitDownPrice: round(s.prevClose * (1 - lim), 2)
    }
  }
  async function stockMinute(code) {
    const s = stocks[code]
    if (!s) return { data: [], open: 0, preClose: 0 }
    // 由开高低收确定性地生成 240 分钟分时
    const data = []
    let p = s.open
    const step = (s.price - s.open) / 240
    for (let i = 0; i < 240; i++) {
      p = round(p + step + (rnd() - 0.5) * 0.02, 2)
      data.push({ time: `${String(9 + Math.floor((i + 30) / 60)).padStart(2, '0')}:${String((i + 30) % 60).padStart(2, '0')}`, price: p, avg: round((p + s.open) / 2, 2), volume: Math.round(rnd() * 1e5) })
    }
    return { data, open: s.open, preClose: s.prevClose }
  }
  async function boardKline(boardId) {
    // 题材日线：从 history 抽取该题材 heat 当作可展示的走势（明确是演示走势）
    const candles = history.slice(-60).map((row, i) => {
      const h = row.subjects[boardId]?.heat ?? 40
      return { date: row.date, open: round(h - 1, 1), close: round(h, 1), high: round(h + 1.5, 1), low: round(h - 2, 1), volume: Math.round(1e6 + h * 1e5) }
    })
    return { subjectId: boardId, name: '', candles }
  }

  return {
    get state() { return state },
    get meta() { return meta },
    get market() {
      const list = Object.values(stocks)
      return {
        indices,
        amount: 7.3e11,
        addAmount: null,
        tradeDate: `演示第 ${dayIndex} 日`,
        updatedAt: meta.asOf,
        upCount: list.filter((s) => s.changePct > 0).length,
        downCount: list.filter((s) => s.changePct < 0).length,
        limitUpCount: list.filter((s) => s.limitUpStreak > 0).length,
        series: history.map((row) => round(Object.values(row.subjects).reduce((a, b) => a + b.heat, 0) / Math.max(1, Object.keys(row.subjects).length), 1))
      }
    },
    refresh,
    advance,
    stockQuote,
    stockMinute,
    boardKline
  }
}
