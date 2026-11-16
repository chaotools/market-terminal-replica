<script setup>
import { onMounted, ref } from 'vue'
import { useAppStore, useUserStore } from '../stores.js'

const app = useAppStore()
const user = useUserStore()
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const code = ref('')
const countdown = ref(0)
const message = ref('')
let timer = null

function sendCode() {
  if (countdown.value > 0) return
  countdown.value = 60
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) clearInterval(timer)
  }, 1000)
  message.value = '验证码已发送（本地模拟：任意 6 位数字）'
}

async function submit() {
  message.value = ''
  if (!code.value || code.value.length < 4) { message.value = '请输入验证码'; return }
  if (newPassword.value.length < 6) { message.value = '新密码至少 6 位'; return }
  if (newPassword.value !== confirmPassword.value) { message.value = '两次输入的新密码不一致'; return }
  try {
    await window.electron?.invoke?.('saveSetting', { key: 'user.passwordChangedAt', value: new Date().toISOString() })
    message.value = '密码修改成功（本地模拟，未接入真实账号系统）'
    oldPassword.value = ''; newPassword.value = ''; confirmPassword.value = ''; code.value = ''
  } catch (error) {
    message.value = `提交失败：${error.message}`
  }
}

onMounted(() => { app.setActiveGroup(5) })
</script>

<template>
  <div class="form-page">
    <div class="form-card">
      <div class="form-title">修改密码</div>
      <div class="form-row"><label>当前密码</label><input v-model="oldPassword" type="password" placeholder="原始应用需旧密码校验" /></div>
      <div class="form-row"><label>验证码</label><input v-model="code" maxlength="6" placeholder="请输入短信验证码" /></div>
      <div class="form-row"><label>新密码</label><input v-model="newPassword" type="password" placeholder="6~16 位新密码" /></div>
      <div class="form-row"><label>确认密码</label><input v-model="confirmPassword" type="password" placeholder="再次输入新密码" /></div>
      <div class="form-actions">
        <button class="btn-plain" :disabled="countdown > 0" @click="sendCode">{{ countdown > 0 ? `已发送(${countdown}s)` : '发送验证码' }}</button>
        <button class="btn-primary" @click="submit">提交</button>
      </div>
      <div class="form-hint">{{ message || '原始接口：/app/sms/no-login/:phone 发送验证码，/app/user/password 修改密码；复刻版仅本地模拟。' }}</div>
    </div>
  </div>
</template>
