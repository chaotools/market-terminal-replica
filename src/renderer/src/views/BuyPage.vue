<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore, useUserStore } from '../stores.js'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const user = useUserStore()

const planKey = computed(() => String(route.meta?.plan || 'vip'))
const selectedTerm = ref(2)
const payMethod = ref('wx')
const message = ref('')

const PLANS = {
  vip: {
    title: '题材库会员',
    tagline: '题材掘金 · 情报流 · 全部题材 · 问董秘 · 研究报告',
    role: 'vip',
    benefits: [
      { title: '题材掘金', desc: '题材挖掘榜/涨停榜/涨幅榜，情报流与题材图谱' },
      { title: '题材轮动', desc: '按涨停数/涨幅的轮动矩阵与历史周期' },
      { title: '全部题材', desc: '全题材排名、成分股与领跌股联动' },
      { title: '问董秘', desc: '上市公司问答与排名（本地契约占位）' },
      { title: '研究报告', desc: '研报列表与 PDF 预览入口' },
      { title: '历史回溯', desc: '题材热度历史与持续天数' }
    ],
    terms: [
      { id: 1, name: '月度', amount: 198, badge: '' },
      { id: 2, name: '季度', amount: 528, badge: '省 66 元' },
      { id: 3, name: '年度', amount: 1888, badge: '最优惠' }
    ]
  },
  svip: {
    title: '甄选版',
    tagline: '甄选盯盘 · 题材监控 · 甄选股池 · 龙虎榜 · 二板定龙',
    role: 'svip',
    benefits: [
      { title: '甄选盯盘', desc: '甄选版盯盘页与实时异动' },
      { title: '题材监控', desc: '领涨/晋级/主线/持续题材监控' },
      { title: '甄选股池', desc: '股池配置与甄选股榜单' },
      { title: '龙虎榜', desc: '日期/个股/席位资金与机构动向' },
      { title: '二板定龙', desc: '二板定龙梯队与日历' },
      { title: '竞价优选', desc: '集合竞价优选与强度筛选' }
    ],
    terms: [
      { id: 1, name: '月度', amount: 398, badge: '' },
      { id: 2, name: '季度', amount: 1098, badge: '省 96 元' },
      { id: 3, name: '年度', amount: 3688, badge: '最优惠' }
    ]
  }
}

const plan = computed(() => PLANS[planKey.value] || PLANS.vip)
const term = computed(() => plan.value.terms.find((t) => t.id === selectedTerm.value) || plan.value.terms[0])

async function createOrder() {
  message.value = ''
  const order = {
    orderId: 'LOCAL-' + Date.now(),
    productName: `${plan.value.title} · ${term.value.name}`,
    amount: term.value.amount,
    status: 0,
    payMethod: payMethod.value,
    createTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
    note: '本地模拟订单：未接入真实支付'
  }
  try {
    const existing = await window.electron?.invoke?.('getSetting', 'orders')
    const list = Array.isArray(existing) ? existing : []
    await window.electron?.invoke?.('saveSetting', { key: 'orders', value: [order, ...list] })
    app.setRole(plan.value.role)
    message.value = `已生成本地订单 ${order.orderId}（模拟支付成功，可在“我的订单”查看）`
  } catch (error) {
    message.value = `创建订单失败：${error.message}`
  }
}

onMounted(() => { app.setActiveGroup(3) })
</script>

<template>
  <div class="buy-page">
    <div class="buy-hero" v-if="planKey !== 'qz'">
      <div>
        <h2>{{ plan.title }}</h2>
        <p>{{ plan.tagline }}</p>
      </div>
      <div class="price-tag">
        <b>¥{{ term.amount }}</b>
        <span>{{ term.name }} · 本地模拟价格</span>
      </div>
    </div>

    <template v-if="planKey !== 'qz'">
      <div class="buy-section">
        <h3>权益内容</h3>
        <div class="benefit-grid">
          <div v-for="item in plan.benefits" :key="item.title" class="benefit-card">
            <h4>{{ item.title }}</h4>
            <p>{{ item.desc }}</p>
          </div>
        </div>
      </div>

      <div class="buy-section">
        <h3>选择时长</h3>
        <div class="price-cards">
          <div v-for="t in plan.terms" :key="t.id" class="price-card" :class="{ active: selectedTerm === t.id }" @click="selectedTerm = t.id">
            <span class="badge" v-if="t.badge">{{ t.badge }}</span>
            <div class="term">{{ t.name }}</div>
            <div class="amount">¥{{ t.amount }}<small> / {{ t.name === '年度' ? '年' : t.name === '季度' ? '季' : '月' }}</small></div>
            <div class="term">折合 ¥{{ (t.amount / (t.id === 1 ? 1 : t.id === 2 ? 3 : 12)).toFixed(1) }} / 月</div>
          </div>
        </div>
      </div>

      <div class="buy-section">
        <h3>支付方式</h3>
        <div class="pay-methods">
          <div class="pay-method" :class="{ active: payMethod === 'wx' }" @click="payMethod = 'wx'">微信支付（模拟）</div>
          <div class="pay-method" :class="{ active: payMethod === 'ali' }" @click="payMethod = 'ali'">支付宝（模拟）</div>
          <div class="pay-method" :class="{ active: payMethod === 'corp' }" @click="payMethod = 'corp'">对公转账（模拟）</div>
        </div>
        <div class="buy-actions">
          <button class="btn-primary" @click="createOrder">立即开通（本地模拟）</button>
          <button class="btn-plain" @click="router.push('/user/order')">我的订单</button>
          <span class="buy-success">{{ message }}</span>
        </div>
        <p class="buy-note">
          原始应用：`/buy-vip`、`/buy-svip` 通过 webview 打开 H5 活动页（k=NBkPA6Fb / k=mekUHZx3），订单来自 `/app/vip-order/`。
          复刻版不接入第三方账户、支付渠道或权益校验，仅提供本地权益说明与本地模拟订单流程。
        </p>
      </div>
    </template>

    <template v-else>
      <div class="buy-section" style="display: flex; gap: 30px; align-items: center">
        <div class="qr-placeholder">客服二维码<br />（原始应用为本地图片资源；复刻版不含第三方素材）</div>
        <div>
          <h3>圈子 / 客服</h3>
          <p class="buy-note">
            原始 `/buy-qz` 展示客服二维码图片。复刻版不包含原素材，保留交互结构；如需演示可在本地替换 `resources/` 下的二维码图片。
          </p>
          <button class="btn-plain" @click="router.push('/subject/excavate')">返回题材库</button>
        </div>
      </div>
    </template>
  </div>
</template>
