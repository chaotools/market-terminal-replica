import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out', 'renderer')
const port = Number(process.env.PORT || 4173)

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
  const target = path.resolve(root, rel)
  if (!target.startsWith(root)) {
    res.writeHead(403).end('forbidden')
    return
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found: ' + rel)
    return
  }
  res.writeHead(200, {
    'content-type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store'
  })
  fs.createReadStream(target).pipe(res)
}).listen(port, '127.0.0.1', () => {
  console.log(`[serve] http://127.0.0.1:${port}  <-  ${root}`)
})
