import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)

console.log('[build] 1/3 构建渲染层 (vite -> out/renderer)')
execFileSync(process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
  stdio: 'inherit'
})

console.log('[build] 2/3 复制主进程与 preload (-> out/main, out/preload)')
fs.mkdirSync(path.join(root, 'out'), { recursive: true })
fs.cpSync(path.join(root, 'src', 'main'), path.join(root, 'out', 'main'), { recursive: true })
fs.cpSync(path.join(root, 'src', 'preload'), path.join(root, 'out', 'preload'), { recursive: true })

console.log('[build] 3/3 生成图标并写入构建元信息')
execFileSync(process.execPath, [path.join('scripts', 'make-icon.mjs')], { stdio: 'inherit' })
fs.writeFileSync(
  path.join(root, 'out', 'build-info.json'),
  JSON.stringify({
    version: '0.1.0',
    build: 100,
    builtAt: new Date().toISOString(),
    layout: {
      main: 'out/main/index.js',
      preload: 'out/preload/index.js',
      renderer: 'out/renderer/index.html'
    }
  }, null, 2)
)

console.log('[build] 完成：out/main + out/preload + out/renderer')
