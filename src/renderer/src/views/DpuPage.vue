<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/client.js'
import { useAppStore } from '../stores.js'

const app = useAppStore()
const conditions = ref([])
const name = ref('')
const board = ref('all')
const pctMin = ref('')
const pctMax = ref('')
const streakMin = ref('')
const amountMin = ref('')
const message = ref('')
const preview = ref([])
const loading = ref(false)

const BOARD_OPTIONS = [
  { key: 'all', label: '全部市场' },
  { key: 'sh', label: '上证' },
  { key: 'sz', label: '深证' },
  { key: 'cy', label: '创业板' }
]

const activeCondition = ref(null)
const formTitle = computed(() => (activeCondition.value ? `编辑条件：${activeCondition.value.name}` : '新建条件'))

async function loadConditions() {
  loading.value = true
  try {
    const data = await api.getDpuConditions()
    conditions.value = Array.isArray(data?.list) ? data.list : []
  } catch { conditions.value = [] } finally { loading.value = false }
}

function resetForm() {
  activeCondition.value = null
  name.value = ''
  board.value = 'all'
  pctMin.value = ''
  pctMax.value = ''
  streakMin.value = ''
  amountMin.value = ''
  message.value = ''
}

function edit(item) {
  activeCondition.value = item
  name.value = item.name || ''
  board.value = item.board || 'all'
  pctMin.value = item.pctMin ?? ''
  pctMax.value = item.pctMax ?? ''
  streakMin.value = item.streakMin ?? ''
  amountMin.value = item.amountMin ?? ''
}

async function save() {
  if (!name.value.trim()) { message.value = '请填写条件名称'; return }
  const payload = {
    name: name.value.trim(),
    board: board.value,
    pctMin: pctMin.value === '' ? null : Number(pctMin.value),
    pctMax: pctMax.value === '' ? null : Number(pctMax.value),
    streakMin: streakMin.value === '' ? null : Number(streakMin.value),
    amountMin: amountMin.value === '' ? null : Number(amountMin.value)
  }
  try {
    if (activeCondition.value) await api.updateDpuCondition({ ...payload, id: activeCondition.value.id })
    else await api.addDpuCondition(payload)
    message.value = '保存成功（本地内存条件）'
    await loadConditions()
    activeCondition.value = null
  } catch (error) {
    message.value = `保存失败：${error.message}`
  }
}

async function runPreview() {
  try {
    const data = await api.previewDpu({ board: board.value, pctMin: pctMin.value, pctMax: pctMax.value, streakMin: streakMin.value, amountMin: amountMin.value })
    preview.value = Array.isArray(data?.rows) ? data.rows : []
    message.value = preview.value.length ? `预览命中 ${preview.value.length} 只` : '预览结果为空（本地契约 server 无行情源）'
  } catch (error) {
    message.value = `预览失败：${error.message}`
  }
}

onMounted(() => { app.setActiveGroup(3); loadConditions() })
</script>

<template>
  <div class="dpu-layout">
    <aside class="dpu-side">
      <div class="side-tabs">
        <button class="active">条件选股</button>
        <button>战法组合</button>
      </div>
      <div style="flex: 1; overflow: auto; padding: 6px 8px">
        <div v-for="item in conditions" :key="item.id" class="dpu-cond-row" @click="edit(item)" style="cursor: pointer">
          <span class="name">{{ item.name }}</span>
          <span class="muted">{{ item.board === 'all' ? '全部' : item.board.toUpperCase() }}</span>
        </div>
        <div v-if="!conditions.length" class="intel-empty">{{ loading ? '加载中…' : '暂无已保存条件' }}</div>
      </div>
      <div style="padding: 8px; border-top: 1px solid var(--border)">
        <button class="btn-primary" style="width: 100%" @click="resetForm">+ 新建条件</button>
      </div>
    </aside>

    <main class="dpu-main">
      <div class="form-title">{{ formTitle }}</div>
      <div class="form-row"><label>条件名称</label><input v-model="name" maxlength="30" placeholder="例如：连板回踩低吸" /></div>
      <div class="form-row">
        <label>市场板块</label>
        <select v-model="board">
          <option v-for="opt in BOARD_OPTIONS" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
        </select>
      </div>
      <div class="form-row"><label>涨跌幅区间</label><input v-model="pctMin" placeholder="下限 %" style="min-width: 90px; width: 110px" /><span>~</span><input v-model="pctMax" placeholder="上限 %" style="min-width: 90px; width: 110px" /></div>
      <div class="form-row"><label>最低连板数</label><input v-model="streakMin" placeholder="例如 2" style="min-width: 90px; width: 110px" /></div>
      <div class="form-row"><label>成交额下限</label><input v-model="amountMin" placeholder="单位：亿" style="min-width: 90px; width: 110px" /></div>
      <div class="form-actions">
        <button class="btn-primary" @click="save">保存条件</button>
        <button class="btn-plain" @click="runPreview">预览选股</button>
        <button class="btn-plain" @click="resetForm">重置</button>
      </div>
      <div class="form-hint">{{ message || '原始应用：/dpu/condition-stock/preview/v2 预览，/dpu/user-config/stock-condition/{add,update} 持久化；复刻版为本地内存实现。' }}</div>

      <div class="form-title" style="margin-top: 18px">预览结果</div>
      <table class="data-table" v-if="preview.length">
        <thead><tr><th>名称</th><th>代码</th><th class="num">现价</th><th class="num">涨跌幅</th><th class="num">连板</th></tr></thead>
        <tbody><tr v-for="row in preview" :key="row.code"><td>{{ row.name }}</td><td>{{ row.code }}</td><td class="num">{{ row.price }}</td><td class="num">{{ row.changePct }}</td><td class="num">{{ row.limitUpStreak || '--' }}</td></tr></tbody>
      </table>
      <div class="table-empty" v-else>暂无预览结果（本地契约 server 无行情源时不造假数据）</div>
    </main>
  </div>
</template>
