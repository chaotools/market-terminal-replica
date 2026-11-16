/**
 * 规模基准：不同股票池 × 题材数下，领域派生与快照的开销
 * 用合成数据，不联网
 */
import { deriveSubjects, toSnapshot } from '../shared/domain.mjs'

function makeState(stockCount, subjectCount, perStock = 3) {
  const defs = Array.from({ length: subjectCount }, (_, i) => ({
    id: `S${i}`, name: `题材${i}`, sector: 'bench', bias: 0.5
  }))
  const stocks = {}
  for (let i = 0; i < stockCount; i++) {
    const subjectIds = []
    for (let k = 0; k < perStock; k++) subjectIds.push(`S${(i * 7 + k * 13) % subjectCount}`)
    stocks[`C${i}`] = {
      code: `C${i}`, name: `样本${i}`,
      subjectIds: [...new Set(subjectIds)],
      base: 10, prevClose: 10, price: 10.5, changePct: 5,
      turnover: 1e8, volume: 1e6,
      limitUpStreak: i % 20 === 0 ? 1 : 0,
      firstSealAt: null, sealAmount: 0, leadCount: 0
    }
  }
  const flow = Object.fromEntries(defs.map((d) => [d.id, 0.5]))
  const history = [{
    day: 1,
    date: '2026-11-16',
    subjects: Object.fromEntries(defs.map((d) => [d.id, { heat: 50, changePct: 1, limitUpCount: 1, limitUpHeight: 1 }]))
  }]
  return { rng: 1, day: 1, tick: 1, subjectDefs: defs, stocks, flow, history }
}

const cases = [
  { label: '当前：1800 只 × 8 题材', stocks: 1800, subjects: 8 },
  { label: '中等：3000 只 × 60 题材', stocks: 3000, subjects: 60 },
  { label: '全量：5000 只 × 300 题材', stocks: 5000, subjects: 300 }
]

console.log('=== 领域计算开销 ===')
for (const item of cases) {
  const state = makeState(item.stocks, item.subjects)
  deriveSubjects(state)
  const rounds = 5
  const t0 = performance.now()
  for (let i = 0; i < rounds; i++) deriveSubjects(state)
  const deriveMs = (performance.now() - t0) / rounds
  const t1 = performance.now()
  let snapshot
  for (let i = 0; i < rounds; i++) snapshot = toSnapshot(state, { includeEngine: false })
  const snapMs = (performance.now() - t1) / rounds
  const bytes = Buffer.byteLength(JSON.stringify(snapshot))
  console.log(`${item.label}: deriveSubjects ${deriveMs.toFixed(1)}ms | 聚合快照 ${snapMs.toFixed(1)}ms | payload ${(bytes / 1024).toFixed(0)}KB`)
}
