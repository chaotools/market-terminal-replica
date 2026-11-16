<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/client.js'
import { useAppStore } from '../stores.js'

const app = useAppStore()
const tab = ref('all')
const rows = ref([])
const loading = ref(false)

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'paid', label: '已支付' },
  { key: 'unpaid', label: '未支付' }
]

const filtered = computed(() => {
  if (tab.value === 'all') return rows.value
  if (tab.value === 'paid') return rows.value.filter((r) => r.status === 1 || r.payStatus === 1)
  return rows.value.filter((r) => !(r.status === 1 || r.payStatus === 1))
})

async function load() {
  loading.value = true
  let remote = []
  try {
    const data = await api.getOrders()
    remote = Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.list) ? data.list : []
  } catch { remote = [] }
  let local = []
  try {
    const orders = await window.electron?.invoke?.('getSetting', 'orders')
    local = Array.isArray(orders) ? orders : []
  } catch { local = [] }
  rows.value = [...local, ...remote]
  loading.value = false
}

onMounted(() => { app.setActiveGroup(5); load() })
</script>

<template>
  <div class="form-page">
    <div class="form-card">
      <div class="form-title">我的订单</div>
      <div class="order-tabs">
        <button v-for="t in TABS" :key="t.key" :class="{ active: tab === t.key }" @click="tab = t.key">{{ t.label }}</button>
      </div>
      <table class="data-table" v-if="filtered.length">
        <thead><tr><th>订单号</th><th>商品</th><th class="num">金额</th><th>状态</th><th>下单时间</th></tr></thead>
        <tbody>
          <tr v-for="row in filtered" :key="row.orderId || row.id">
            <td>{{ row.orderId || row.id }}</td>
            <td>{{ row.productName || row.vipName || '会员订单' }}</td>
            <td class="num">{{ row.amount ?? row.payAmount ?? '—' }}</td>
            <td>{{ row.status === 1 ? '已支付' : '未支付' }}</td>
            <td>{{ row.createTime || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <div class="table-empty" v-else>{{ loading ? '加载中…' : '暂无订单（本地契约 server /app/vip-order/ 空态）' }}</div>
      <div class="form-hint">原始应用订单来自 /app/vip-order/；复刻版不接入支付，仅展示本地模拟订单结构。</div>
    </div>
  </div>
</template>
