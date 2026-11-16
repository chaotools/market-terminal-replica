/**
 * Lumi 只读行情通道客户端
 *
 * 约束：
 * - token 每次请求时从 auth-token.json 读取（会轮换），不缓存、不硬编码
 * - 任何日志/异常都不带 token
 * - 只调用只读工具：list_workspaces / list_available_pages / memory_read /
 *   client_exec_script（内部仅 clientCall / dataCall 的只读方法）
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BASE = process.env.LUMI_BASE || 'http://127.0.0.1:23816'

/**
 * token 文件定位优先级：
 *   1. LUMI_TOKEN_FILE 环境变量
 *   2. 自动发现 ~/lumi/users/<任意用户>/mcp/auth-token.json
 * 不写死任何用户名或本机路径
 */
function discoverTokenFile() {
  if (process.env.LUMI_TOKEN_FILE) return process.env.LUMI_TOKEN_FILE
  const base = path.join(os.homedir(), 'lumi', 'users')
  try {
    for (const entry of fs.readdirSync(base)) {
      const candidate = path.join(base, entry, 'mcp', 'auth-token.json')
      if (fs.existsSync(candidate)) return candidate
    }
  } catch { /* 未安装客户端时没有该目录 */ }
  return ''
}

const TOKEN_FILE = discoverTokenFile()

function readToken() {
  if (!TOKEN_FILE) {
    throw new Error('未找到 Lumi token 文件，请设置 LUMI_TOKEN_FILE 或确认客户端已登录')
  }
  const raw = fs.readFileSync(TOKEN_FILE, 'utf8')
  const parsed = JSON.parse(raw)
  const token = parsed?.authToken
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('authToken 不存在或为空')
  }
  return token.trim()
}

async function request(pathname, { method = 'GET', body, timeout = 20000 } = {}) {
  const token = readToken()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(`${BASE}${pathname}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    })
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* 非 JSON 响应 */ }
    return { ok: response.ok, status: response.status, json, text }
  } finally {
    clearTimeout(timer)
  }
}

function unwrap(payload) {
  const content = payload?.content
  if (Array.isArray(content)) {
    const textPart = content.find((item) => item?.type === 'text')?.text
    if (typeof textPart === 'string') {
      try { return JSON.parse(textPart) } catch { return textPart }
    }
  }
  return payload
}

export async function listTools() {
  const result = await request('/mcp-tools')
  if (!result.ok) throw new Error(`GET /mcp-tools 返回 ${result.status}`)
  const data = result.json
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.tools)) return data.tools
  return data
}

export async function callTool(name, args = {}) {
  const result = await request('/mcp-call', { method: 'POST', body: { name, args } })
  if (!result.ok) throw new Error(`POST /mcp-call(${name}) 返回 ${result.status}`)
  return unwrap(result.json)
}

/** 执行异步函数体脚本；params 通过 args.params 传入，脚本内用 params.xxx */
export async function execScript(script, params) {
  const args = { script }
  if (params !== undefined) args.params = params
  return callTool('client_exec_script', args)
}

export async function marketOverview() {
  return execScript('return await clientCall("marketOverview", {});')
}

export async function searchSecurities(keyword) {
  return execScript('return await dataCall("search_securities", { keyword: params.keyword });', { keyword })
}

export async function realtimeQuery(securities) {
  return execScript('return await dataCall("realtime_query", { securities: params.securities });', { securities })
}

export async function candleQuery(securities, fields, period, offset) {
  return execScript(
    'return await dataCall("candle_query", { securities: params.securities, fields: params.fields, period: params.period, timeRange: { offset: params.offset } });',
    { securities, fields, period, offset }
  )
}

export async function topByAmount(condition) {
  return execScript('return await clientCall("smartStockSelection", { conditions: [params.condition] });', {
    condition: condition || '今日成交额前20名'
  })
}

export function probeConfig() {
  return { base: BASE, tokenConfigured: Boolean(TOKEN_FILE) }
}
