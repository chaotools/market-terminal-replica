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

let mainWindow = null
let tray = null
let serviceProcess = null
let serviceReady = false
let isQuitting = false

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
  try {
    const response = await fetch('http://127.0.0.1:8080/api/version', { signal: AbortSignal.timeout(3000) })
    if (response.ok) {
      const data = await response.json()
      latest = Number(data.build) || current
      serviceReady = true
    }
  } catch {
    log('WARN', '版本检查不可用，使用本地版本号')
  }
  log('INFO', `最新版本号： ${latest} 当前版本号： ${current}`)
  return { current, latest, version: APP_VERSION, updateAvailable: latest > current }
}

function createTray() {
  const iconPath = path.join(ROOT, 'out', 'icon.png')
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  if (icon.isEmpty()) {
    log('WARN', '托盘图标缺失，跳过托盘')
    return
  }
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('Market Terminal Replica')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => showMainWindow() },
    { label: '重新检查版本', click: () => checkVersion() },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit() } }
  ]))
  tray.on('click', () => showMainWindow())
}

function showMainWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#ffffff',
    title: 'Market Terminal Replica',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const rendererEntry = path.join(__dirname, '..', 'renderer', 'index.html')
  mainWindow.loadFile(rendererEntry)
  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    const store = readStore()
    if (!store.confirmOnQuit) return
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['取消', '退出'],
      defaultId: 0,
      title: '确认退出',
      message: '确定要退出行情终端吗？'
    })
    if (choice !== 1) event.preventDefault()
  })

  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.webContents.on('render-process-gone', (_e, details) => log('ERROR', `app:render-process-gone ${details.reason}`))
  mainWindow.webContents.on('unresponsive', () => log('WARN', '渲染进程无响应'))
}

function registerIpc() {
  const on = (channel, handler) => ipcMain.handle(channel, handler)

  on('getVersion', () => ({ version: APP_VERSION, build: APP_BUILD, platform: process.platform }))
  on('checkVersion', () => checkVersion())
  on('isMainWindow', (_e, payload) => Boolean(payload?.isMain ?? true))
  on('minimize', () => { mainWindow?.minimize(); return true })
  on('maximize', () => {
    if (!mainWindow) return false
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  on('close', () => { mainWindow?.close(); return true })
  on('restart', () => { isQuitting = true; app.relaunch(); app.quit(); return true })
  on('getStore', (_e, key) => (key ? readStore()[key] ?? null : readStore()))
  on('setStore', (_e, payload) => {
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
    const store = readStore()
    store[payload.key] = payload.value
    return writeStore(store)
  })
  on('getMachineId', () => {
    // 演示用途：不使用任何系统硬件标识
    return crypto.createHash('sha256').update(os.hostname() + APP_VERSION).digest('hex').slice(0, 16)
  })
  on('sendBuryPoint', (_e, payload) => { log('INFO', `bury-point: ${JSON.stringify(payload).slice(0, 200)}`); return true })
  on('getServiceStatus', () => ({ ready: serviceReady, ports: [8080, 8087, 8088, 8886] }))
  on('openURL', (_e, url) => {
    if (!/^https?:\/\//i.test(url)) return false
    shell.openExternal(url)
    return true
  })
  on('openPDF', (_e, file) => {
    if (typeof file !== 'string' || !/\.pdf$/i.test(file)) return false
    shell.openPath(file)
    return true
  })
  on('download', (_e, payload) => { log('INFO', `download requested: ${JSON.stringify(payload).slice(0, 160)}`); return true })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())

  app.whenReady().then(async () => {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    log('INFO', `根目录: ${ROOT} 运行平台： ${process.platform} CPU 架构： ${process.arch}`)
    log('INFO', `日志目录: ${USER_DATA}`)
    log('INFO', `系统版本: ${os.release()} 用户目录: ${os.homedir()}`)
    log('INFO', `GPU功能状态: ${JSON.stringify(app.getGPUFeatureStatus())}`)

    registerIpc()
    startLocalServices()
    await checkVersion()
    createWindow()
    createTray()

    try {
      const ok = globalShortcut.register('Alt+Z', () => {
        if (!mainWindow) return
        mainWindow.isVisible() ? mainWindow.hide() : showMainWindow()
      })
      if (!ok) log('ERROR', 'globalShortcut Alt+Z register failed')
    } catch (error) {
      log('ERROR', `globalShortcut Alt+Z register failed: ${error.message}`)
    }

    setInterval(() => {
      mainWindow?.webContents.send('main-process-message', {
        type: 'heartbeat',
        at: Date.now(),
        serviceReady
      })
    }, 5000).unref()

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    isQuitting = true
    globalShortcut.unregisterAll()
    if (serviceProcess && !serviceProcess.killed) serviceProcess.kill()
  })
}
