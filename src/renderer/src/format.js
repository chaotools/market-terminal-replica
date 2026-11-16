/**
 * 展示格式化工具（与原始应用的展示口径对齐：涨红跌绿、金额万/亿）。
 */

export function toNumber(value) {
  if (value === null || value === undefined || value === '' || value === '--') return NaN
  const n = Number(String(value).replace(/[%,]/g, '').replace(/[万亿]$/, ''))
  if (!Number.isFinite(n)) return NaN
  if (String(value).endsWith('万')) return n * 1e4
  if (String(value).endsWith('亿')) return n * 1e8
  return n
}

export function formatPct(value) {
  const n = typeof value === 'number' ? value : toNumber(value)
  if (!Number.isFinite(n)) return '--'
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%'
}

export function formatPrice(value) {
  const n = typeof value === 'number' ? value : toNumber(value)
  if (!Number.isFinite(n)) return '--'
  return n.toFixed(2)
}

export function formatAmount(value) {
  const n = typeof value === 'number' ? value : toNumber(value)
  if (!Number.isFinite(n)) return '--'
  const abs = Math.abs(n)
  if (abs >= 1e8) return (n / 1e8).toFixed(2) + '亿'
  if (abs >= 1e4) return (n / 1e4).toFixed(1) + '万'
  return n.toFixed(0)
}

export function toneClass(value) {
  const n = typeof value === 'number' ? value : toNumber(value)
  if (!Number.isFinite(n)) return 'flat'
  return n > 0 ? 'up' : n < 0 ? 'down' : 'flat'
}
