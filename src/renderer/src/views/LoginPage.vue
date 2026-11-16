<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores.js'
import { desktopInvoke } from '../data.js'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

const mode = ref('qr')
const phone = ref('')
const password = ref('')
const smsCode = ref('')
const agreed = ref(true)
const error = ref('')
const submitting = ref(false)
const countdown = ref(0)
const deviceCode = ref('')

const canSubmit = computed(() => phone.value.trim().length >= 6)

let timer = null

onMounted(async () => {
  const result = await desktopInvoke('getMachineId')
  deviceCode.value = typeof result === 'string' ? result : ''
})

function switchMode(next) {
  mode.value = next
  error.value = ''
}

function sendSmsCode() {
  if (countdown.value > 0) return
  countdown.value = 60
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) clearInterval(timer)
  }, 1000)
}

function login() {
  error.value = ''
  if (!agreed.value) { error.value = '请先阅读并同意协议！'; return }
  if (!canSubmit.value) { error.value = '请输入正确的手机号'; return }
  submitting.value = true
  try {
    sessionStorage.setItem('loginType', mode.value === 'qr' ? '1' : mode.value === 'sms' ? '2' : '3')
    user.login('local-replica-token')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(redirect)
  } catch (err) {
    error.value = err?.message || '登录失败'
  } finally {
    submitting.value = false
  }
}

function localExperience() {
  agreed.value = true
  phone.value = phone.value || '13800000000'
  mode.value = 'sms'
  login()
}
</script>

<template>
  <div class="login-shell">
    <div class="login-panel">
      <div class="login-title"><span>久赢恒丰</span><span class="page-stage">复刻</span></div>
      <div class="login-sub">题材行情终端 · 本地复刻版（不连接第三方账户）</div>
      <div class="login-tabs">
        <button :class="{ active: mode === 'qr' }" @click="switchMode('qr')">微信扫码</button>
        <button :class="{ active: mode === 'account' }" @click="switchMode('account')">账号登录</button>
        <button :class="{ active: mode === 'sms' }" @click="switchMode('sms')">验证码登录</button>
      </div>

      <template v-if="mode === 'qr'">
        <div class="login-qr">
          <div class="qr-box">复刻版不调用微信登录<br />请使用下方本地体验登录<br />（原始应用：隐藏 webview 抓取 qrconnect 二维码）</div>
          <div class="login-foot">原始链路：qrconnect → /connect/qrcode/&lt;uuid&gt; → 本地渲染二维码 → 回调 code</div>
        </div>
      </template>

      <template v-else>
        <label class="login-field">
          <span>手机号</span>
          <input v-model="phone" maxlength="11" placeholder="请输入手机号" />
        </label>
        <label v-if="mode === 'account'" class="login-field">
          <span>密码</span>
          <input v-model="password" type="password" maxlength="16" placeholder="请输入 6~16 位密码" />
        </label>
        <label v-else class="login-field">
          <span>验证码</span>
          <input v-model="smsCode" maxlength="6" placeholder="请输入 6 位验证码" />
        </label>
        <div v-if="mode === 'sms'" class="login-actions">
          <button :disabled="countdown > 0" @click="sendSmsCode">{{ countdown > 0 ? `已发送(${countdown}s)` : '发送验证码' }}</button>
        </div>
      </template>

      <label class="login-check">
        <input v-model="agreed" type="checkbox" />
        <span>我已阅读并同意<button class="login-link" @click.prevent="$router.push('/privacy')">《用户协议》和《隐私政策》</button></span>
      </label>
      <div class="login-error">{{ error }}</div>
      <div class="login-actions">
        <button class="primary" :disabled="submitting" @click="login">登 录</button>
        <button @click="localExperience">本地体验登录</button>
      </div>
      <div class="login-foot">
        原始应用设备码：deviceCode = getMachineId，platform = 4；登录态 token 存主进程 store，本复刻以本地 token 等价实现。<br />
        未注册的手机号码将自动生成账号（仅本地模拟）。
        <span v-if="deviceCode">当前设备码：{{ deviceCode }}</span>
      </div>
    </div>
  </div>
</template>
