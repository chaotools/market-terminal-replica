import test from 'node:test'
import assert from 'node:assert/strict'
import {
  subjectDefsOf, deriveSubjects, deriveLadder, deriveMarketLadder, deriveSubjectTree,
  detectEvents, deriveSubjectStocks, deriveQuadrants, deriveRotation,
  deriveRankings, deriveMarket, toSnapshot
} from '../shared/domain.mjs'

const subjectDefs = [
  { id: 's1', name: '测试题材甲', sector: '板块一', bias: 0.2, condition: '' },
  { id: 's2', name: '测试题材乙', sector: '板块一', bias: -0.1, condition: '' },
  { id: 's3', name: '测试题材丙', sector: '板块二', bias: 0.05, condition: '' }
]

const stocks = {
  '000001': { code: '000001', name: '甲股票', market: 'SZ', subjectIds: ['s1', 's2'], prevClose: 10, price: 11, changePct: 10, turnover: 2.4e9, limitUpStreak: 2, firstSealAt: 1, sealAmount: 1.2e8, marketCap: 6e9 },
  '600002': { code: '600002', name: '乙股票', market: 'SH', subjectIds: ['s1'], prevClose: 20, price: 20.4, changePct: 2, turnover: 1.1e9, limitUpStreak: 0, firstSealAt: null, sealAmount: 0, marketCap: 3e9 },
  '300003': { code: '300003', name: '丙股票', market: 'SZ', subjectIds: ['s3'], prevClose: 8, price: 7.8, changePct: -2.5, turnover: 0.6e9, limitUpStreak: 0, firstSealAt: null, sealAmount: 0, marketCap: 1e9 }
}

const state = { subjectDefs, stocks, flow: { s1: 0.6, s2: 0.3, s3: 0.1 }, history: [], day: 3, tick: 12 }
const empty = { subjectDefs: [], stocks: {}, flow: {}, history: [], day: 0, tick: 0 }

test('空状态派生不抛错且返回空集合', () => {
  assert.deepEqual(subjectDefsOf(empty), [])
  assert.deepEqual(deriveSubjects(empty), [])
  assert.equal(deriveLadder(empty, 's1').total, 0)
  assert.equal(deriveMarketLadder(empty).total, 0)
  assert.deepEqual(deriveSubjectTree(empty), [])
  assert.deepEqual(deriveQuadrants(empty).points, [])
  assert.deepEqual(deriveRotation(empty, [], 5).cells, [])
  assert.deepEqual(deriveSubjectStocks(empty, 's1'), [])
  const market = deriveMarket(empty)
  assert.equal(Number.isFinite(market.heat), true)
  assert.equal(Number.isFinite(market.factor), true)
  const snapshot = toSnapshot(empty)
  assert.deepEqual(snapshot.subjects, [])
})

test('题材派生：热度归一到 0..100，龙头与阶段字段齐全', () => {
  const subjects = deriveSubjects(state)
  assert.equal(subjects.length, 3)
  for (const subject of subjects) {
    assert.equal(subject.heat >= 0 && subject.heat <= 100, true)
    assert.equal(Number.isFinite(subject.changePct), true)
    assert.equal(typeof subject.leadStock === 'object' || subject.leadStock === null, true)
    assert.equal(typeof subject.stage, 'string')
  }
  const s1 = subjects.find((s) => s.subjectId === 's1')
  assert.equal(s1.limitUpCount, 1)
  assert.equal(s1.leadStock.code, '000001')
})

test('连板梯队与全市场梯队按板数分组', () => {
  const ladder = deriveLadder(state, 's1')
  assert.equal(ladder.highest, 2)
  assert.equal(ladder.total, 1)
  assert.equal(Array.isArray(ladder.tiers), true)
  const market = deriveMarketLadder(state)
  assert.equal(market.highest, 2)
})

test('题材树按板块聚合父子节点', () => {
  const tree = deriveSubjectTree(state)
  assert.equal(tree.length, 2)
  const group = tree.find((g) => g.groupName === '板块一')
  assert.equal(group.childIds.length, 2)
})

test('事件类型在约定集合内且带题材来源', () => {
  const previous = { subjects: deriveSubjects(state) }
  const nextState = {
    ...state,
    stocks: {
      ...state.stocks,
      '000001': { ...state.stocks['000001'], limitUpStreak: 3, price: 12.1, changePct: 21 }
    },
    tick: 13
  }
  const events = detectEvents(previous, deriveSubjects(nextState))
  const allowed = new Set(['stage', 'limitup', 'ladder', 'lead', 'heat', 'rank'])
  for (const event of events) {
    assert.equal(allowed.has(event.type), true)
    assert.equal(typeof event.subjectId, 'string')
  }
})

test('四象限/轮动/榜单结构可用于渲染层', () => {
  const quadrants = deriveQuadrants(state)
  assert.equal(typeof quadrants.heatMid, 'number')
  assert.equal(quadrants.points.length, 3)
  const rotation = deriveRotation(state, [], 5)
  assert.equal(Array.isArray(rotation.subjectIds), true)
  assert.equal(Array.isArray(rotation.cells), true)
  const rankings = deriveRankings(state)
  assert.equal(Array.isArray(rankings.topDig), true)
})

test('快照聚合包含渲染层所需全部键', () => {
  const snapshot = toSnapshot(state, { includeEngine: false })
  for (const key of ['subjects', 'tree', 'ladderAll', 'quadrants', 'rotation', 'rankings', 'market', 'day', 'tick']) {
    assert.equal(Object.hasOwn(snapshot, key), true, `missing ${key}`)
  }
})
