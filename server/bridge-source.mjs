/**
 * 数据桥接数据源：把“原始应用明文 API 抓包快照”（jyhf-analysis/screens/reference/api）
 * 转换成复刻版领域引擎的 state，并附加行情/分时/题材日线等原始 payload。
 *
 * 只使用明文接口（realtime/index、realtime/market/time、stock/realtime*、subject/realtime、
 * subject/daily 等）；原始应用的加密响应（AES 字符串）不做解密、不参与桥接。
 */
import fs from 'node:fs'
import { deriveSubjects } from '../shared/domain.mjs'

export function loadBridgeFixtures(fileUrl) {
  return JSON.parse(fs.readFileSync(fileUrl, 'utf8'))
}

export function buildBridgeState(fixtures) {
  const subjectDefs = (fixtures.subjectDefs || []).map((s) => ({
    id: s.id,
    name: s.name,
    sector: s.sector || '题材'
  }))
  const stocks = {}
  for (const row of fixtures.stocks || []) {
    if (!row.code) continue
    stocks[row.code] = {
      ...row,
      subjectIds: Array.isArray(row.subjectIds) ? row.subjectIds : []
    }
  }
  const state = {
    subjectDefs,
    stocks,
    flow: {},
    history: [],
    day: 1,
    tick: 1
  }
  // 单帧历史：使热度变化为 0（没有历史快照时不编造趋势）
  const subjects = deriveSubjects(state)
  const market = fixtures.market || {}
  const date = market.tradeDate || (fixtures.meta && fixtures.meta.tradeDate) || ''
  state.history = [{
    date,
    subjects: Object.fromEntries(subjects.map((s) => [s.subjectId, { heat: s.heat, changePct: s.changePct }]))
  }]
  return state
}
