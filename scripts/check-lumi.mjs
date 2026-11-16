import {
  listTools, marketOverview, searchSecurities, realtimeQuery, topByAmount, probeConfig
} from '../server/lumi-client.mjs'

const clip = (value, n = 900) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > n ? text.slice(0, n) + ' …' : text
}

console.log('=== 配置 ===')
console.log(JSON.stringify(probeConfig()))

console.log('\n=== 1) GET /mcp-tools ===')
try {
  const tools = await listTools()
  const list = Array.isArray(tools) ? tools : []
  console.log(`工具数: ${list.length}`)
  console.log(list.map((t) => t?.name).filter(Boolean).join(', '))
} catch (error) {
  console.log('失败:', error.message)
  console.log('→ 需要确认同花顺AI / Lumi 客户端是否已启动并登录')
  process.exit(1)
}

console.log('\n=== 2) marketOverview ===')
try {
  const data = await marketOverview()
  console.log('类型:', Array.isArray(data) ? 'array' : typeof data)
  console.log('keys:', data && typeof data === 'object' ? Object.keys(data).slice(0, 20).join(', ') : '-')
  console.log(clip(data))
} catch (error) {
  console.log('失败:', error.message)
}

console.log('\n=== 3) search 上证指数 ===')
try {
  const data = await searchSecurities('上证指数')
  console.log(clip(data))
} catch (error) {
  console.log('失败:', error.message)
}

console.log('\n=== 4) realtime 上证指数 ===')
try {
  const data = await realtimeQuery([{ market: 'USHI', code: '1A0001' }])
  console.log('类型:', Array.isArray(data) ? `array(${data.length})` : typeof data)
  console.log(clip(data, 1400))
} catch (error) {
  console.log('失败:', error.message)
}

console.log('\n=== 5) smartStockSelection 今日成交额前20名 ===')
try {
  const data = await topByAmount('今日成交额前20名')
  console.log('类型:', Array.isArray(data) ? `array(${data.length})` : typeof data)
  console.log(clip(data, 1600))
} catch (error) {
  console.log('失败:', error.message)
}
