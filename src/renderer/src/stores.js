/**
 * Pinia stores：对齐原始应用的 app / user / config / tagsView 四个 store。
 * 角色（role）在本复刻中是本地可切换的模拟态，不接任何真实鉴权。
 */
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    version: '',
    build: 0,
    serviceReady: false,
    source: 'none',
    asOf: null,
    sessionState: 'unknown',
    role: 'vip',
    activeGroup: 1,
    indices: [],
    indexAmount: null,
    hasNewMsg: false,
    isLiving: false,
    isTradeTime: false,
    clock: ''
  }),
  actions: {
    setSource(source) { this.source = source || 'none' },
    setMeta(meta = {}) {
      this.asOf = meta.asOf || null
      this.sessionState = meta.sessionState || 'unknown'
      if (meta.source) this.source = meta.source
    },
    setRole(role) { this.role = role },
    setActiveGroup(index) { this.activeGroup = index },
    setIndices(list) { this.indices = Array.isArray(list) ? list : [] },
    setIndexAmount(amount) { this.indexAmount = amount || null },
    setVersion(info = {}) {
      this.version = info.version || ''
      this.build = info.build || 0
    },
    setServiceReady(ready) { this.serviceReady = Boolean(ready) },
    setClock(value) { this.clock = value }
  }
})

export const useUserStore = defineStore('user', {
  state: () => ({
    token: '',
    userInfo: {
      userId: 'local-demo',
      nickName: '本地复刻用户',
      avatar: '',
      phone: '',
      vip: { isVip: false, vipTime: null },
      svip: { isVip: false, svipTime: null },
      ssvip: { isVip: false },
      trainingCampVip: { isVip: false },
      pcLogincount: 0,
      pcLoginLimitCount: 1
    }
  }),
  getters: {
    isLogin: (state) => Boolean(state.token),
    isVip: (state) => Boolean(state.userInfo.vip?.isVip || state.userInfo.svip?.isVip),
    isSvip: (state) => Boolean(state.userInfo.svip?.isVip || state.userInfo.ssvip?.isVip),
    exceedLoginCount: (state) => (state.userInfo.pcLogincount || 0) > (state.userInfo.pcLoginLimitCount || 1)
  },
  actions: {
    setToken(token) {
      this.token = token || ''
      this.syncStore()
    },
    syncStore() {
      try { window.electron?.invoke?.('setStore', { key: 'Authorization', value: this.token || null }) } catch { /* 非桌面环境 */ }
    },
    restoreToken() {
      try { this.token = window.electron?.sendSync?.('getStore', 'Authorization') || '' } catch { this.token = '' }
    },
    setUserInfo(info = {}) { this.userInfo = { ...this.userInfo, ...info } },
    login(token = 'local-replica-token') { this.setToken(token) },
    logout() { this.setToken('') }
  }
})

export const useConfigStore = defineStore('config', {
  state: () => ({ adList: [], riskInfo: '', sourceInfo: '', remoteVersion: null, updateContent: [], forceUpdate: false }),
  actions: {
    setConfig(data = {}) {
      this.riskInfo = data.riskInfo || ''
      this.sourceInfo = data.sourceInfo || ''
    },
    setAds(list = []) { this.adList = Array.isArray(list) ? list : [] },
    setVersionInfo(data = {}) {
      this.remoteVersion = data
      this.updateContent = Array.isArray(data.updateContent) ? data.updateContent : []
      this.forceUpdate = Boolean(data.pcForceUpdate)
    }
  }
})

export const useTagsViewStore = defineStore('tagsView', {
  state: () => ({ visitedViews: [] }),
  actions: {
    add(route) {
      if (!route || !route.path || route.meta?.hidden) return
      if (route.name === 'Home' || route.path === '/') return
      const title = route.meta?.title || route.name || route.path
      const existing = this.visitedViews.find((v) => v.path === route.path)
      if (existing) { existing.title = title; return }
      this.visitedViews.push({ path: route.path, fullPath: route.fullPath, title })
      if (this.visitedViews.length > 12) this.visitedViews.shift()
    },
    remove(path) { this.visitedViews = this.visitedViews.filter((v) => v.path !== path) },
    reset() { this.visitedViews = [] }
  }
})
