'use strict'

const { contextBridge, ipcRenderer } = require('electron')

const INVOKE_CHANNELS = new Set([
  'getVersion', 'checkVersion', 'isMainWindow', 'minimize', 'maximize', 'close',
  'restart', 'setMainSize', 'setLoginSize',
  'getStore', 'setStore', 'removeStore', 'getSetting', 'saveSetting',
  'getMachineId', 'apiDecode', 'sendBuryPoint', 'sendUserTrace', 'getServiceStatus',
  'openURL', 'openPDF', 'download', 'exportDownload', 'readLocalFile', 'closeThisWindow',
  'openMessage', 'openFindPwd', 'openRouteWindow', 'closeVersion',
  'downloadUpdate', 'installUpdate', 'getUpdateState', 'messageClick'
])

const SYNC_CHANNELS = new Set(['getStore', 'getMachineId', 'isMainWindow', 'apiDecode', 'decrypt'])

const EVENT_CHANNELS = new Set([
  'main-process-message', 'progress-change', 'restore', 'messageClick', 'switchKline',
  'timer#1s', 'timer#3s', 'timer#5s', 'timer#10s', 'timer#60s'
])

contextBridge.exposeInMainWorld('electron', {
  isDesktop: true,
  platform: process.platform,

  invoke(channel, payload) {
    if (!INVOKE_CHANNELS.has(channel)) return Promise.reject(new Error(`blocked channel: ${channel}`))
    return ipcRenderer.invoke(channel, payload)
  },

  send(channel, payload) {
    if (!EVENT_CHANNELS.has(channel)) return false
    ipcRenderer.send(channel, payload)
    return true
  },

  sendSync(channel, payload) {
    if (!SYNC_CHANNELS.has(channel)) return null
    return ipcRenderer.sendSync(channel, payload)
  },

  on(channel, callback) {
    if (!EVENT_CHANNELS.has(channel)) return () => {}
    const listener = (_event, ...args) => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
})
