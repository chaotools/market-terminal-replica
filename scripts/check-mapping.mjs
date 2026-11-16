/**
 * 用构造行情验证 Lumi 字段 → 领域 state 的映射（不联网）
 * 字段口径：6=昨收 7/8/9=开/高/低 10=现价 13=量 19=成交额 55=名称
 *          199112=涨跌幅(%) 264648=涨跌额
 */
import { buildState } from '../server/live-source.mjs'
import { deriveSubjects, deriveMarketLadder } from '../shared/domain.mjs'

const universe = {
  subjects: [
    { id: 'LC01', name: '测试题材A', condition: 'x', memberCount: 3 },
    { id: 'LC02', name: '测试题材B', condition: 'y', memberCount: 1 }
  ],
  stocks: [
    { code: '600000', name: '样本一', market: 'USHA', subjectIds: ['LC01', 'LC02'] },
    { code: '300001', name: '样本二', market: 'USZA', subjectIds: ['LC01'] },
    { code: '600002', name: '样本三', market: 'USHA', subjectIds: ['LC01'] }
  ],
  streakByCode: { '600000': 4, '600002': 2 }
}

const quotes = {
  USHA600000: { 6: 10, 7: 10.1, 8: 11, 9: 10, 10: 11, 13: 1000000, 19: 500000000, 55: '样本一', 199112: 10, 264648: 1 },
  USZA300001: { 6: 20, 7: 20.2, 8: 22, 9: 19.9, 10: 21, 13: 600000, 19: 300000000, 55: '样本二', 199112: 5, 264648: 1 },
  USHA600002: { 6: 8, 7: 8.1, 8: 8.4, 9: 8, 10: 8.6, 13: 400000, 19: 120000000, 55: '样本三', 199112: 'NaN', 264648: 'NaN' }
}

const state = buildState(universe, quotes, null, [{ code: '600003', name: '池外涨停', market: 'USHA' }])
const subjects = deriveSubjects(state)
const ladder = deriveMarketLadder(state)

console.log('=== 个股映射 ===')
for (const stock of Object.values(state.stocks)) {
  console.log(`${stock.code} ${stock.name} price=${stock.price} prev=${stock.prevClose} pct=${stock.changePct} amount=${stock.turnover} streak=${stock.limitUpStreak}/昨${stock.yesterdayStreak} subjects=${stock.subjectIds.join(',')} offPool=${stock.offPool || false}`)
}

console.log('\n=== 题材派生 ===')
for (const s of subjects) {
  console.log(`${s.subjectId} ${s.subjectName} 热度=${s.heat} 涨幅=${s.changePct} 涨停=${s.limitUpCount} 最高=${s.limitUpHeight} 成分=${s.memberCount} 龙头=${s.leadStock?.name || '-'}`)
}

console.log('\n=== 全市场梯队 ===')
console.log(JSON.stringify(ladder.tiers.map((t) => ({ tier: t.key, names: t.stocks.map((s) => s.name) }))))

const ok = state.stocks['600000'].price === 11
  && state.stocks['600000'].limitUpStreak === 4
  && state.stocks['600003']?.offPool === true
  && ladder.highest === 4
console.log(`\n结论：${ok ? '通过' : '未通过'}`)
process.exitCode = ok ? 0 : 1
