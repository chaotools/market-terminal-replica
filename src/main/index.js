'use strict'

const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog, globalShortcut, nativeImage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')
const { fork } = require('node:child_process')

const APP_VERSION = '0.1.0'
const APP_BUILD = 100
const ROOT = path.resolve(__dirname, '..', '..')
const USER_DATA = app.getPath('userData')
const LOG_DIR = path.join(USER_DATA, 'logs')
const LOG_FILE = path.join(LOG_DIR, 'main.log')
const STORE_FILE = path.join(USER_DATA, 'settings.json')
const RENDERER_ENTRY = path.join(__dirname, '..', 'renderer', 'index.html')
const PRELOAD_ENTRY = path.join(__dirname, '..', 'preload', 'index.js')
const MAIN_SIZE = { width: 1280, height: 820 }
const LOGIN_SIZE = { width: 960, height: 640 }

const SCREENSHOT_ROUTES = [
  '/subject/excavate', '/market-trend/main', '/trend', '/fav',
  '/subject/periodic', '/dpu', '/user/profile', '/login', '/update', '/message'
]

let mainWindow = null
let loadingWindow = null
let tray = null
let serviceProcess = null
let serviceReady = false
let isQuitting = false
let updateTimer = null
let updateProgress = 0
const childWindows = new Map()

function log(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] main - ${message}\n`
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, line)
  } catch { /* logging must never break startup */ }
  process.stdout.write(line)
}

function readStore() {
  try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) } catch { return {} }
}
function writeStore(data) {
  try {
    fs.mkdirSync(USER_DATA, { recursive: true })
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2))
    return true
  } catch (error) {
    log('ERROR', `writeStore failed: ${error.message}`)
    return false
  }
}

/** 本地复刻会话：token 存主进程 store（对齐原始应用 getStore/setStore 协议）。 */
function ensureLocalSession() {
  const store = readStore()
  if (store.Authorization === undefined) {
    store.Authorization = 'local-replica-token'
    writeStore(store)
  }
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send(channel, payload) } catch { /* ignore */ }
  }
}

function startLocalServices() {
  const entry = path.join(ROOT, 'server', 'local-services.mjs')
  if (!fs.existsSync(entry)) {
    log('WARN', `本地服务入口不存在: ${entry}`)
    return
  }
  try {
    serviceProcess = fork(entry, [], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', REPLICA_PORTS: '8080,8087,8088,8886' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    })
    serviceProcess.stdout?.on('data', (chunk) => {
      const text = String(chunk).trim()
      if (!text) return
      if (text.includes('listening')) serviceReady = true
      log('INFO', `service: ${text.split('\n')[0]}`)
    })
    serviceProcess.stderr?.on('data', (chunk) => log('WARN', `service: ${String(chunk).trim().split('\n')[0]}`))
    serviceProcess.on('exit', (code) => {
      serviceReady = false
      log('WARN', `本地服务退出 code=${code}`)
    })
    log('INFO', '本地服务已拉起 (ELECTRON_RUN_AS_NODE)')
  } catch (error) {
    log('ERROR', `本地服务启动失败: ${error.message}`)
  }
}

async function checkVersion() {
  const current = APP_BUILD
  let latest = current
  let versionInfo = null
  try {
    const response = await fetch('http://127.0.0.1:8080/api/app/config/app-version', { signal: AbortSignal.timeout(3000) })
    if (response.ok) {
      const payload = await response.json()
      versionInfo = payload.data
      latest = Number(payload.data?.pcVersion) || current
      serviceReady = true
    }
  } catch {
    log('WARN', '版本检查不可用，使用本地版本号')
  }
  log('INFO', `最新版本号： ${latest} 当前版本号： ${current}`)
  return { current, latest, version: APP_VERSION, updateAvailable: latest > current, info: versionInfo }
}

function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 460,
    height: 300,
    frame: false,
    resizable: false,
    show: false,
    alwaysOnTop: true,
    backgroundColor: '#0f1b33',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  const entry = path.join(ROOT, 'out', 'resources', 'loading.html')
  if (fs.existsSync(entry)) {
    loadingWindow.loadFile(entry)
    loadingWindow.once('ready-to-show', () => { if (!mainWindow) loadingWindow?.show() })
  }
  loadingWindow.on('closed', () => { loadingWindow = null })
}

function closeLoadingWindow() {
  if (loadingWindow) {
    try { loadingWindow.destroy() } catch { /* ignore */ }
    loadingWindow = null
  }
}

function applyWindowSize(size) {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  mainWindow.setMinimumSize(900, 600)
  mainWindow.setSize(size.width, size.height, true)
  mainWindow.center()
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: MAIN_SIZE.width,
    height: MAIN_SIZE.height,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#ffffff',
    title: '久赢恒丰 · 逐项复刻',
    webPreferences: {
      preload: PRELOAD_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  })

  mainWindow.loadFile(RENDERER_ENTRY)
  mainWindow.once('ready-to-show', () => {
    closeLoadingWindow()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences) => {
    delete webPreferences.preload
    webPreferences.contextIsolation = true
    webPreferences.nodeIntegration = false
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) { event.preventDefault(); log('WARN', `blocked navigation: ${url}`) }
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    const store = readStore()
    if (store.confirmOnQuit === false) return
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['取消', '退出'],
      defaultId: 0,
      title: '确认退出',
      message: '程序正在运行中，确认关闭吗？'
    })
    if (choice !== 1) event.preventDefault()
  })

  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.webContents.on('render-process-gone', (_e, details) => log('ERROR', `app:render-process-gone ${details.reason}`))
  mainWindow.webContents.on('unresponsive', () => log('WARN', '渲染进程无响应'))
}

function openRouteWindow({ route, title, width = 900, height = 680, singleton = true } = {}) {
  if (!route) return null
  const key = String(route).split('?')[0]
  if (singleton && childWindows.has(key)) {
    const existing = childWindows.get(key)
    if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return true }
    childWindows.delete(key)
  }
  const win = new BrowserWindow({
    width,
    height,
    minWidth: 420,
    minHeight: 360,
    title: title || '久赢恒丰',
    frame: true,
    show: false,
    backgroundColor: '#ffffff',
    parent: mainWindow || undefined,
    webPreferences: {
      preload: PRELOAD_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.loadFile(RENDERER_ENTRY, { hash: route })
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => childWindows.delete(key))
  childWindows.set(key, win)
  log('INFO', `open child window: ${route} (${width}x${height})`)
  return true
}

function closeChildWindow(route) {
  const key = String(route || '/update').split('?')[0]
  const win = childWindows.get(key)
  if (win && !win.isDestroyed()) win.close()
  childWindows.delete(key)
}

function createTray() {
  const iconPath = path.join(ROOT, 'out', 'icon.png')
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  if (icon.isEmpty()) {
    log('WARN', '托盘图标缺失，跳过托盘')
    return
  }
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('久赢恒丰 · 逐项复刻')
  const resize = (delta) => {
    if (!mainWindow) return
    const [w, h] = mainWindow.getSize()
    mainWindow.setSize(Math.max(900, w + delta), Math.max(600, h + Math.round(delta * 0.6)))
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口 (Alt+Z)', click: () => showMainWindow() },
    { label: '放大 (Ctrl+I)', click: () => resize(80) },
    { label: '缩小 (Ctrl+O)', click: () => resize(-80) },
    { label: '还原 (Ctrl+P)', click: () => applyWindowSize(MAIN_SIZE) },
    { type: 'separator' },
    { label: '退出 (Ctrl+Q)', click: () => { isQuitting = true; app.quit() } }
  ]))
  tray.on('click', () => showMainWindow())
  tray.on('double-click', () => showMainWindow())
}

function showMainWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function applyAutoStart() {
  const store = readStore()
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(store.autoStart),
      openAsHidden: Boolean(store.autoStart),
      args: ['--processStart']
    })
  } catch (error) {
    log('WARN', `setLoginItemSettings failed: ${error.message}`)
  }
}

function startUpdateDownload() {
  if (updateTimer) return
  updateProgress = 0
  broadcast('progress-change', { percent: 0 })
  updateTimer = setInterval(() => {
    updateProgress = Math.min(100, updateProgress + 8)
    broadcast('progress-change', { percent: updateProgress })
    if (updateProgress >= 100) {
      clearInterval(updateTimer)
      updateTimer = null
      const store = readStore()
      store.updateState = 'downloaded'
      writeStore(store)
      log('INFO', '更新包下载完成（本地模拟）')
    }
  }, 240)
}

function registerIpc() {
  const on = (channel, handler) => ipcMain.handle(channel, handler)
  const onSync = (channel, handler) => ipcMain.on(channel, (event, payload) => { event.returnValue = handler(payload) })

  on('getVersion', () => ({ version: APP_VERSION, build: APP_BUILD, platform: process.platform }))
  on('checkVersion', () => checkVersion())
  on('isMainWindow', () => true)
  on('minimize', () => { mainWindow?.minimize(); return true })
  on('maximize', () => {
    if (!mainWindow) return false
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  on('close', () => { mainWindow?.close(); return true })
  on('restart', () => { isQuitting = true; app.relaunch(); app.quit(); return true })
  on('setMainSize', () => { applyWindowSize(MAIN_SIZE); return true })
  on('setLoginSize', () => { applyWindowSize(LOGIN_SIZE); return true })

  on('getStore', (_e, key) => (key ? (readStore()[key] ?? null) : readStore()))
  on('setStore', (_e, payload) => {
    if (!payload || typeof payload.key !== 'string') return false
    const store = readStore()
    store[payload.key] = payload.value
    return writeStore(store)
  })
  on('removeStore', (_e, key) => {
    const store = readStore()
    delete store[key]
    return writeStore(store)
  })
  on('getSetting', (_e, key) => readStore()[key] ?? null)
  on('saveSetting', (_e, payload) => {
    if (!payload || typeof payload.key !== 'string') return false
    const store = readStore()
    store[payload.key] = payload.value
    return writeStore(store)
  })
  on('getMachineId', () => crypto.createHash('sha256').update(os.hostname() + APP_VERSION).digest('hex').slice(0, 16))
  on('apiDecode', (_e, payload) => {
    if (typeof payload === 'string') { try { return JSON.parse(payload) } catch { return payload } }
    return payload
  })
  on('sendBuryPoint', (_e, payload) => { log('INFO', `bury-point: ${JSON.stringify(payload).slice(0, 200)}`); return true })
  on('sendUserTrace', (_e, payload) => { log('INFO', `user-trace: ${JSON.stringify(payload).slice(0, 200)}`); return true })
  on('getServiceStatus', () => ({ ready: serviceReady, ports: [8080, 8087, 8088, 8886] }))
  on('openURL', (_e, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false
    shell.openExternal(url)
    return true
  })
  on('openPDF', (_e, payload) => {
    if (payload && typeof payload === 'object') {
      const url = payload.url || payload.file || ''
      if (!url) return false
      return openRouteWindow({ route: `/preview-pdf?url=${encodeURIComponent(url)}`, title: payload.title || 'PDF 预览', width: 1000, height: 760 })
    }
    if (typeof payload === 'string' && /\.pdf$/i.test(payload)) { shell.openPath(payload); return true }
    return false
  })
  on('download', (_e, payload) => { log('INFO', `download requested: ${JSON.stringify(payload).slice(0, 160)}`); return true })
  on('exportDownload', () => ({ success: false, message: '导出通道待 P1 阶段实现' }))
  on('openMessage', () => openRouteWindow({ route: '/message', title: '消息通知', width: 520, height: 680 }))
  on('openFindPwd', () => openRouteWindow({ route: '/find-pwd', title: '找回密码', width: 480, height: 620 }))
  on('closeVersion', () => closeChildWindow('/update'))
  on('downloadUpdate', () => { startUpdateDownload(); return true })
  on('installUpdate', () => ({ installed: false, message: '本地复刻版不安装第三方更新包' }))
  on('getUpdateState', () => ({ progress: updateProgress, state: readStore().updateState || 'idle' }))
  on('messageClick', (_e, payload) => { mainWindow?.webContents.send('messageClick', payload); return true })
  on('openRouteWindow', (_e, payload) => openRouteWindow(payload))
  on('progress', () => true)

  onSync('getStore', (key) => (key ? (readStore()[key] ?? null) : readStore()))
  onSync('getMachineId', () => crypto.createHash('sha256').update(os.hostname() + APP_VERSION).digest('hex').slice(0, 16))
  onSync('isMainWindow', () => true)
  onSync('apiDecode', (payload) => {
    if (typeof payload === 'string') { try { return JSON.parse(payload) } catch { return payload } }
    return payload
  })
  onSync('decrypt', (payload) => {
    if (typeof payload === 'string') { try { return JSON.parse(payload) } catch { return payload } }
    return payload
  })
}

function startTimers() {
  for (const seconds of [1, 3, 5, 10, 60]) {
    setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      mainWindow.webContents.send(`timer#${seconds}s`, { at: Date.now() })
    }, seconds * 1000).unref()
  }
  setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('main-process-message', { type: 'heartbeat', at: Date.now(), serviceReady })
  }, 5000).unref()
}

function parseFlags() {
  const flags = { screenshot: '', out: '', hidden: false }
  for (const arg of process.argv.slice(1)) {
    if (arg === '--screenshot' || arg.startsWith('--screenshot=')) {
      flags.screenshot = arg.includes('=') ? arg.split('=').slice(1).join('=') : 'default'
    } else if (arg.startsWith('--out=')) {
      flags.out = arg.slice('--out='.length)
    } else if (arg === '--hidden') {
      flags.hidden = true
    }
  }
  return flags
}

async function runScreenshotMode(flags) {
  const outDir = flags.out ? path.resolve(flags.out) : path.join(ROOT, 'out', 'screens')
  fs.mkdirSync(outDir, { recursive: true })
  const routes = flags.screenshot && flags.screenshot !== 'default'
    ? flags.screenshot.split(',').map((s) => s.trim()).filter(Boolean)
    : SCREENSHOT_ROUTES
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    frame: false,
    webPreferences: {
      preload: PRELOAD_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      offscreen: true
    }
  })
  const written = []
  for (const route of routes) {
    try {
      await win.loadFile(RENDERER_ENTRY, { hash: route })
      await delay(1600)
      try {
        const debug = await win.webContents.executeJavaScript(`(() => {
          const el = document.querySelector('#app')
          const app = el && el.__vue_app__
          const current = app && app.config.globalProperties.$route
          return {
            hash: location.hash,
            meta: current ? JSON.parse(JSON.stringify(current.meta || {})) : null,
            topnav: !!document.querySelector('.topnav'),
            tagsbar: !!document.querySelector('.tagsbar'),
            statusbar: !!document.querySelector('.statusbar')
          }
        })()`)
        log('INFO', `route-debug ${JSON.stringify(debug)}`)
      } catch (debugError) {
        log('WARN', `route-debug failed: ${debugError.message}`)
      }
      const image = await win.webContents.capturePage()
      const png = image.toPNG()
      const name = (route.replace(/[/?#&=]+/g, '_').replace(/^_+|_+$/g, '') || 'home') + '.png'
      const file = path.join(outDir, name)
      fs.writeFileSync(file, png)
      written.push({ route, file, bytes: png.length })
      log('INFO', `screenshot ${route} -> ${name} (${png.length} bytes)`)
    } catch (error) {
      log('ERROR', `screenshot ${route} failed: ${error.message}`)
    }
  }
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ at: new Date().toISOString(), captured: written }, null, 2))
  win.destroy()
  isQuitting = true
  app.quit()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())

  app.whenReady().then(async () => {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    try { app.setAppUserModelId('com.jyhf.replica') } catch { /* ignore */ }
    log('INFO', `根目录: ${ROOT} 运行平台： ${process.platform} CPU 架构： ${process.arch}`)
    log('INFO', `日志目录: ${USER_DATA}`)
    log('INFO', `系统版本: ${os.release()} 用户目录: ${os.homedir()}`)
    log('INFO', `GPU功能状态: ${JSON.stringify(app.getGPUFeatureStatus())}`)

    registerIpc()
    ensureLocalSession()
    applyAutoStart()

    const flags = parseFlags()
    if (flags.screenshot) {
      startLocalServices()
      await checkVersion()
      await delay(1200)
      return runScreenshotMode(flags)
    }

    if (!flags.hidden) createLoadingWindow()
    startLocalServices()
    await checkVersion()
    createMainWindow()
    createTray()
    startTimers()

    try {
      const ok = globalShortcut.register('Alt+Z', () => {
        if (!mainWindow) return
        mainWindow.isVisible() ? mainWindow.hide() : showMainWindow()
      })
      if (!ok) log('ERROR', 'globalShortcut Alt+Z register failed')
    } catch (error) {
      log('ERROR', `globalShortcut Alt+Z register failed: ${error.message}`)
    }

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow() })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    isQuitting = true
    if (updateTimer) clearInterval(updateTimer)
    globalShortcut.unregisterAll()
    if (serviceProcess && !serviceProcess.killed) serviceProcess.kill()
  })
}
