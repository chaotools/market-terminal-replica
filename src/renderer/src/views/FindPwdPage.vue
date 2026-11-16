<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const phone = ref('')
const code = ref('')
const password = ref('')
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
}

function submit() {
  if (!phone.value || !code.value || password.value.length < 6) {
    message.value = '请填写手机号、验证码和 6 位以上新密码'
    return
  }
  message.value = '密码已重置（本地模拟），请返回登录'
}
</script>

<template>
  <div class="pad-page">
    <div class="page-head"><span class="page-title">找回密码</span><span class="page-stage">P1 子窗</span></div>
    <div class="page-card">
      <label class="login-field"><span>手机号</span><input v-model="phone" maxlength="11" placeholder="请输入手机号" /></label>
      <label class="login-field"><span>验证码</span><input v-model="code" maxlength="6" placeholder="请输入验证码" /></label>
      <label class="login-field"><span>新密码</span><input v-model="password" type="password" placeholder="6~16 位新密码" /></label>
      <div class="login-error">{{ message }}</div>
      <div class="login-actions">
        <button :disabled="countdown > 0" @click="sendCode">{{ countdown > 0 ? `已发送(${countdown}s)` : '发送验证码' }}</button>
        <button class="primary" @click="submit">提交</button>
        <button @click="router.push('/login')">返回登录</button>
      </div>
    </div>
  </div>
</template>
