'use strict'

const { contextBridge, ipcRenderer } = require('electron')

const ALLOWED = new Set([
  'getVersion', 'checkVersion', 'isMainWindow', 'minimize', 'maximize', 'close',
  'restart', 'getStore', 'setStore', 'removeStore', 'getSetting', 'saveSetting',
  'getMachineId', 'sendBuryPoint', 'getServiceStatus', 'openURL', 'openPDF', 'download'
])

contextBridge.exposeInMainWorld('electron', {
  isDesktop: true,
  platform: process.platform,

  invoke(channel, payload) {
    if (!ALLOWED.has(channel)) return Promise.reject(new Error(`blocked channel: ${channel}`))
    return ipcRenderer.invoke(channel, payload)
  },

  on(channel, callback) {
    const allowedEvents = new Set(['main-process-message'])
    if (!allowedEvents.has(channel)) return () => {}
    const listener = (_event, ...args) => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
})
