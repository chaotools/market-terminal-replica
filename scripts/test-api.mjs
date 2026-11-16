import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTS = [18080, 18087, 18088, 18886]

let child = null

async function waitReady(timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORTS[0]}/health`, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return true
    } catch { /* not ready yet */ }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return false
}

async function get(pathname) {
  const response = await fetch(`http://127.0.0.1:${PORTS[0]}${pathname}`, { signal: AbortSignal.timeout(5000) })
  assert.equal(response.status, 200, `${pathname} should be 200`)
  return response.json()
}

test.before(async () => {
  child = spawn(process.execPath, [path.join(root, 'server', 'local-services.mjs')], {
    cwd: root,
    env: { ...process.env, REPLICA_PORTS: PORTS.join(',') },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', () => {})
  child.stderr.on('data', () => {})
  const ready = await waitReady()
  assert.equal(ready, true, '本地服务未在超时内就绪')
})

test.after(() => { child?.kill() })

test('本地 API 契约：应用配置与版本', async () => {
  const version = await get('/api/app/config/app-version')
  assert.equal(version.code, 200)
  assert.equal(version.data.pcVersion, 100)
  const info = await get('/api/app/config/info')
  assert.equal(info.code, 200)
  assert.equal(typeof info.data.riskInfo, 'string')
})

test('本地 API 契约：用户信息与登录态形状', async () => {
  const user = await get('/api/app/user/info/v2')
  assert.equal(user.code, 200)
  assert.equal(user.data.userId, 'local-demo')
  assert.equal(typeof user.data.vip.isVip, 'boolean')
  assert.equal(typeof user.data.pcLoginLimitCount, 'number')
})

test('本地 API 契约：题材列表/实时/详情', async () => {
  const list = await get('/api/app/subject/list/v2')
  assert.equal(list.code, 200)
  assert.equal(Array.isArray(list.data.list), true)
  const realtime = await get('/api/app/subject/realtime')
  assert.equal(realtime.code, 200)
  assert.equal(Array.isArray(realtime.data), true)
  const missing = await get('/api/app/subject/query/not-exists')
  assert.equal(missing.code, 200)
  assert.equal(missing.data.error, 'not_found')
})

test('本地 API 契约：市场统计与行情端点', async () => {
  const summary = await get('/api/app/stock/summary/pctChg')
  assert.equal(summary.code, 200)
  for (const key of ['up', 'down', 'flat', 'limitUp', 'limitDown', 'total']) assert.equal(Number.isFinite(summary.data[key]), true)
  const amount = await get('/api/app/realtime/index-amount')
  assert.equal(amount.code, 200)
  assert.equal(Number.isFinite(amount.data.amount), true)
  assert.equal(Number.isFinite(amount.data.addAmount), true)
  const index = await get('/api/app/realtime/index/v2')
  assert.equal(index.code, 200)
  assert.equal(Array.isArray(index.data), true)
  const marketTime = await get('/api/app/realtime/market/time?last=0')
  assert.equal(Array.isArray(marketTime.data), true)
  const rank = await get('/api/app/stock/realtime-rank/v2?start=0&end=50')
  assert.equal(rank.code, 200)
  assert.equal(Array.isArray(rank.rows), true)
  assert.equal(Number.isFinite(rank.total), true)
  const realtime = await get('/api/app/stock/realtime')
  assert.equal(Array.isArray(realtime.data), true)
})

test('本地 API 契约：未知路径返回 404 code（HTTP 仍 200）', async () => {
  const unknown = await get('/api/app/not-a-real-endpoint')
  assert.equal(unknown.code, 404)
})

test('旧版工作台端点保持兼容', async () => {
  const snapshot = await get('/snapshot')
  assert.equal(Array.isArray(snapshot.subjects), true)
  const health = await get('/health')
  assert.equal(health.ok, true)
  const pct = await get('/API/FactorTiming')
  assert.equal(Number.isFinite(pct.score), true)
})
