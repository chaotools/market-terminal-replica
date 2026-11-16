import {
  createInitialState, advance, toSnapshot, deriveLadder,
  deriveSubjectStocks, deriveCandles
} from '../shared/domain.mjs'

const state = createInitialState()
for (let i = 0; i < 45; i++) advance(state)
const snap = toSnapshot(state)
const ladder = deriveLadder(state, snap.subjects[0].subjectId)
const stocks = deriveSubjectStocks(state, snap.subjects[0].subjectId)
const kline = deriveCandles(state, stocks[0].code)

function findBad(value, path = '$', out = []) {
  if (typeof value === 'number' && !Number.isFinite(value)) out.push(`${path} = ${value}`)
  else if (Array.isArray(value)) value.forEach((v, i) => findBad(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) findBad(v, `${path}.${k}`, out)
  }
  return out
}

const bad = findBad(snap)
const top = snap.subjects.slice(0, 4).map((s) =>
  `${s.subjectName} 热度${s.heat} 涨幅${s.changePct}% 涨停${s.limitUpCount}家 最高${s.limitUpHeight}板 持续${s.sustainDays}日 领涨${s.leadTimes}次 ${s.stage} 龙头:${s.leadStock?.name || '-'}`
)

console.log('=== 领域引擎回归检查 ===')
console.log(`day=${snap.day} tick=${snap.tick} 题材=${snap.subjects.length} 股票池=${Object.keys(state.stocks).length} 选中题材成分股=${stocks.length}`)
console.log(`市场热度=${snap.market.heat} 关注度=${snap.market.attention} 因子=${snap.market.factor} 涨停=${snap.market.limitUpTotal} 最高板=${snap.market.maxHeight}`)
console.log(`象限分组=${snap.quadrants.counts.map((c) => c.name + ':' + c.count).join(' / ')}`)
console.log(`轮动日历=${snap.rotation.days.length}日 × ${snap.rotation.cells.length}题材`)
console.log(`连板梯队=${ladder.tiers.map((t) => t.key + ':' + t.stocks.length).join(' ')} 最高${ladder.highest}板`)
console.log(`K线=${kline.name} ${kline.candles.length}根`)
console.log('\n=== 热度前四 ===\n' + top.join('\n'))
console.log('\nNaN/Infinity 数量: ' + bad.length)
if (bad.length) {
  console.log(bad.slice(0, 20).join('\n'))
  process.exitCode = 1
}
