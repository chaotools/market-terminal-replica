/**
 * 回归测试：针对代码审查发现的逻辑问题进行固化，防止再次退化。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveSubjects, deriveLadder, detectEvents } from '../shared/domain.mjs'
import { createDemoEngine } from '../server/demo-source.mjs'

const defs = [{ id: 's1', name: '题材甲', sector: '板块' }]
const mkStocks = (streak, chg) => ({
  '1': { code: '1', name: '股A', subjectIds: ['s1'], changePct: chg, turnover: 1e8, prevClose: 10, price: 10 * (1 + chg / 100), limitUpStreak: streak, firstSealAt: null, sealAmount: 0 }
})

test('heatDelta 以 history 最后一帧为基准，不能把当前帧当上一帧', () => {
  const base = { subjectDefs: defs, stocks: mkStocks(1, 5), flow: { s1: 0.5 }, history: [], day: 1, tick: 0 }
  const cur = deriveSubjects(base)[0]
  // 正确：history 只放历史帧，当前 heat 不应在 history 里
  const withHistory = { ...base, history: [{ date: 'd1', subjects: { s1: { heat: 10, changePct: 1 } } }] }
  const next = deriveSubjects(withHistory)[0]
  assert.equal(next.heatDelta, Math.round((next.heat - 10) * 10) / 10)
  assert.notEqual(next.heatDelta, 0, '上一帧 heat=10 时 delta 不应为 0')
})

test('连板梯队能表达多档高度（2板/3板），不是只有1板', () => {
  const stocks = {
    '1': { code: '1', name: 'A', subjectIds: ['s1'], changePct: 10, turnover: 1e8, limitUpStreak: 3 },
    '2': { code: '2', name: 'B', subjectIds: ['s1'], changePct: 10, turnover: 1e8, limitUpStreak: 2 },
    '3': { code: '3', name: 'C', subjectIds: ['s1'], changePct: 10, turnover: 1e8, limitUpStreak: 1 }
  }
  const ladder = deriveLadder({ subjectDefs: defs, stocks, flow: {}, history: [] }, 's1')
  assert.equal(ladder.highest, 3)
  assert.deepEqual(ladder.tiers.map((t) => t.key).sort(), ['1板', '2板', '3板'])
})

test('阶段判定：持续高温题材应判为主线而非被分歧吞掉', () => {
  // 构造真正满足主线条件的当前热度：高涨停/连板/资金流 → heat >= 60
  const stocks = {
    '1': { code: '1', name: 'A', subjectIds: ['s1'], changePct: 9, turnover: 6e9, prevClose: 10, price: 10.9, limitUpStreak: 4, firstSealAt: null, sealAmount: 0 }
  }
  const cur = deriveSubjects({ subjectDefs: defs, stocks, flow: { s1: 0.95 }, history: [], day: 6, tick: 0 })[0]
  assert.ok(cur.heat >= 60, `前置条件：当前热度应 >=60，实际 ${cur.heat}`)
  // 历史帧热度贴近当前值，delta 保持温和（不是降温），且连续多日高温
  const history = Array.from({ length: 5 }, (_, i) => ({ date: `d${i}`, subjects: { s1: { heat: cur.heat - 1, changePct: 3 } } }))
  const s = deriveSubjects({ subjectDefs: defs, stocks, flow: { s1: 0.95 }, history, day: 6, tick: 0 })[0]
  assert.equal(s.stage, '主线')
  assert.equal(s.subjectType, '主线题材')
})

test('演示源确定性：同种子两次生成结果一致', async () => {
  const a = await createDemoEngine({ seed: 42, days: 10 })
  const b = await createDemoEngine({ seed: 42, days: 10 })
  assert.equal(a.state.subjectDefs.length, b.state.subjectDefs.length)
  assert.equal(a.state.history.length, b.state.history.length)
  assert.deepEqual(a.state.subjectDefs.map((d) => d.id), b.state.subjectDefs.map((d) => d.id))
  const sa = deriveSubjects(a.state)[0]
  const sb = deriveSubjects(b.state)[0]
  assert.equal(sa.heat, sb.heat, '同种子热度应完全一致')
  assert.equal(sa.heatDelta, sb.heatDelta)
})

test('演示源具备完整连板/资金流/轮动能力', async () => {
  const e = await createDemoEngine({ seed: 7, days: 14 })
  const streaks = Object.values(e.state.stocks).map((s) => s.limitUpStreak)
  assert.ok(Math.max(...streaks) >= 3, '应存在 3 板以上个股')
  assert.ok(Object.values(e.state.flow).some((v) => v > 0 && v < 1), '资金流应有区分度')
  assert.equal(e.state.history.length, 13, '14 日中 13 日进 history，当前日不算')
  assert.equal(deriveSubjects(e.state).some((s) => s.heatDelta !== 0), true)
})

test('阶段切换事件在降温时文案用「降至」', () => {
  const prev = { subjects: [{ subjectId: 's1', subjectName: '甲', heat: 80, stage: '加速', changePct: 5, limitUpCount: 4, limitUpHeight: 4, leadStock: { code: '1', name: 'A' } }] }
  const next = { subjects: [{ subjectId: 's1', subjectName: '甲', heat: 60, stage: '退潮', changePct: -3, limitUpCount: 1, limitUpHeight: 1, leadStock: { code: '1', name: 'A' } }] }
  const evs = detectEvents(prev, next)
  const stage = evs.find((e) => e.type === 'stage')
  assert.ok(stage)
  assert.ok(stage.body.includes('降至'), `应写「降至」，实际: ${stage.body}`)
  assert.ok(!stage.body.includes('升至'))
})
