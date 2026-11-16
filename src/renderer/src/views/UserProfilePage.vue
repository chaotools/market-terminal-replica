<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/client.js'
import { useAppStore, useUserStore } from '../stores.js'
import { ROLE_LABEL } from '../menu.js'

const app = useAppStore()
const user = useUserStore()
const nickName = ref('')
const phone = ref('')
const signature = ref('')
const saving = ref(false)
const message = ref('')

const ROLES = [
  { key: 'none', desc: '基础行情与题材浏览' },
  { key: 'vip', desc: '题材库会员：问道/研报/全部题材' },
  { key: 'svip', desc: '甄选版：监控、股池、龙虎榜' },
  { key: 'ssvip', desc: '战法库：条件选股与策略' }
]

const currentRoleLabel = computed(() => ROLE_LABEL[app.role] || app.role)
const initial = computed(() => (nickName.value || user.userInfo.nickName || '复')[0])

async function load() {
  try {
    const info = await api.getUserInfo()
    if (info) {
      user.setUserInfo(info)
      nickName.value = info.nickName || ''
      phone.value = info.phone || ''
    }
  } catch { /* 本地空态 */ }
}

async function save() {
  saving.value = true
  message.value = ''
  try {
    await window.electron?.invoke?.('saveSetting', { key: 'user.profile', value: { nickName: nickName.value, signature: signature.value } })
    user.setUserInfo({ nickName: nickName.value })
    message.value = '已保存（本地）'
  } catch (error) {
    message.value = `保存失败：${error.message}`
  } finally {
    saving.value = false
  }
}

function logout() {
  user.logout()
  location.hash = '#/login'
}

onMounted(() => { app.setActiveGroup(5); load() })
</script>

<template>
  <div class="form-page">
    <div class="form-card">
      <div class="user-head">
        <div class="avatar-big">{{ initial }}</div>
        <div>
          <div class="user-name">{{ nickName || user.userInfo.nickName }}</div>
          <div class="user-sub">账号 ID：{{ user.userInfo.userId }} · 当前角色：{{ currentRoleLabel }}</div>
        </div>
      </div>

      <div class="form-title">基本资料</div>
      <div class="form-row"><label>昵称</label><input v-model="nickName" maxlength="20" placeholder="请输入昵称" /></div>
      <div class="form-row"><label>手机号</label><input v-model="phone" maxlength="11" placeholder="未绑定（本地模拟）" /></div>
      <div class="form-row"><label>个性签名</label><input v-model="signature" maxlength="40" placeholder="一句话介绍" /></div>
      <div class="form-actions">
        <button class="btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存资料' }}</button>
        <button class="btn-plain" @click="logout">退出登录</button>
      </div>
      <div class="form-hint">{{ message || '原始应用：/app/user/info/v2 获取资料，/app/user 更新；绑定手机/微信走 /app/user/bind-*。' }}</div>

      <div class="form-title" style="margin-top: 20px">会员权益（本地模拟）</div>
      <div class="role-matrix">
        <div v-for="role in ROLES" :key="role.key" class="role-card" :class="{ active: app.role === role.key }">
          <h4>{{ ROLE_LABEL[role.key] }}</h4>
          <p>{{ role.desc }}</p>
          <p style="margin-top: 6px">
            <button class="btn-plain" style="height: 24px; padding: 0 10px" @click="app.setRole(role.key)">{{ app.role === role.key ? '当前角色' : '切换体验' }}</button>
          </p>
        </div>
      </div>
      <div class="form-hint">复刻版不接入真实账户、支付或权益系统；角色切换仅影响本地菜单/页面可见性与付费墙展示。</div>
    </div>
  </div>
</template>
