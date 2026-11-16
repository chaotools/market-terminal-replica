import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function makePng(size) {
  const raw = Buffer.alloc(size * (1 + size * 4))
  const put = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const offset = y * (1 + size * 4) + 1 + x * 4
    raw[offset] = r
    raw[offset + 1] = g
    raw[offset + 2] = b
    raw[offset + 3] = a
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) put(x, y, 20, 33, 61)
  }
  const bars = [
    { x: 7, top: 17, bottom: 26, color: [214, 48, 49] },
    { x: 13, top: 12, bottom: 26, color: [214, 48, 49] },
    { x: 19, top: 15, bottom: 26, color: [15, 122, 87] },
    { x: 25, top: 8, bottom: 26, color: [214, 48, 49] }
  ]
  for (const bar of bars) {
    for (let y = bar.top; y <= bar.bottom; y++) {
      for (let x = bar.x; x <= bar.x + 3; x++) put(x, y, ...bar.color)
    }
  }
  for (let x = 4; x < size - 4; x++) put(x, 4, 255, 255, 255, 90)

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const trayIcon = makePng(32)
const buildIcon = makePng(256)
fs.mkdirSync(path.join(root, 'out'), { recursive: true })
fs.writeFileSync(path.join(root, 'out', 'icon.png'), trayIcon)
fs.mkdirSync(path.join(root, 'build'), { recursive: true })
fs.writeFileSync(path.join(root, 'build', 'icon.png'), buildIcon)
console.log('[icon] 已生成 out/icon.png(32) 与 build/icon.png(256)')
