<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from '../api/client.js'
import { formatPct, toneClass } from '../format.js'

const rankTab = ref('fast')
const mainTab = ref('stocks')
const groups = ref([])
const stocks = ref([])
const rankRows = ref([])
const activeGroupId = ref('')
let timer = null

async function loadRank() {
  try {
    const data = await api.getRealtimeRank({ start: 0, end: 60, sort: rankTab.value === 'fast' ? 'fastChg' : rankTab.value === 'pct' ? 'pctChg' : 'amount', sortType: 'desc' })
    const rows = Array.isArray(data?.rows) ? data.rows : []
    rankRows.value = rows.map((cells, i) => ({
      index: i + 1,
      name: cells[1] || '',
      code: cells[2] || '',
      speed: formatPct(cells[7]),
      pctChg: formatPct(cells[4])
    }))
  } catch { rankRows.value = [] }
}

async function loadFav() {
  try {
    const groupData = await api.getSelfOptionalGroups(1)
    groups.value = Array.isArray(groupData?.list) ? groupData.list : []
    activeGroupId.value = groups.value[0]?.groupId || ''
  } catch { groups.value = [] }
  try {
    const listData = await api.getSelfOptionalStockList(activeGroupId.value || 'g-main')
    stocks.value = Array.isArray(listData?.list) ? listData.list : []
  } catch { stocks.value = [] }
}

function addFavorite() {
  // P1：接入 /app/self-optional/ 增删接口与分组管理
}

onMounted(() => {
  loadRank()
  loadFav()
  timer = setInterval(loadRank, 15000)
})
onUnmounted(() => { clearInterval(timer) })
</script>

<template>
  <div class="fav-page">
    <aside class="fav-rank">
      <div class="tab-strip" style="height: 32px">
        <button class="tab" :class="{ active: rankTab === 'fast' }" @click="rankTab = 'fast'; loadRank()">快速涨幅排名</button>
        <button class="tab" :class="{ active: rankTab === 'pct' }" @click="rankTab = 'pct'; loadRank()">今日涨幅排名</button>
        <button class="tab" :class="{ active: rankTab === 'amount' }" @click="rankTab = 'amount'; loadRank()">今日成交额排名</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th class="num" style="width: 44px">序号</th><th>名称</th><th>代码</th><th class="num">涨速</th><th class="num">涨跌幅</th></tr></thead>
          <tbody>
            <tr v-for="row in rankRows" :key="row.code">
              <td class="num muted">{{ row.index }}</td>
              <td>{{ row.name }}</td>
              <td class="muted">{{ row.code }}</td>
              <td class="num" :class="toneClass(row.speed)">{{ row.speed }}</td>
              <td class="num" :class="toneClass(row.pctChg)">{{ row.pctChg }}</td>
            </tr>
            <tr v-if="!rankRows.length"><td colspan="5" class="table-empty">暂无数据（未连接行情源）</td></tr>
          </tbody>
        </table>
      </div>
    </aside>

    <div class="fav-main">
      <div class="fav-header">
        <div class="tab-strip" style="height: 30px; border: none; padding: 0">
          <button class="tab" :class="{ active: mainTab === 'stocks' }" @click="mainTab = 'stocks'">全部自选股票</button>
          <button class="tab" :class="{ active: mainTab === 'subjects' }" @click="mainTab = 'subjects'">全部自选题材</button>
        </div>
        <div class="right">
          <button class="tool-btn">列表</button>
          <button class="tool-btn">多股同列</button>
          <button class="tool-btn" @click="addFavorite">+ 添加自选</button>
        </div>
      </div>

      <div class="table-wrap" v-if="stocks.length">
        <table class="data-table">
          <thead><tr><th class="num" style="width: 44px">序号</th><th>名称</th><th>代码</th><th class="num">现价</th><th class="num">涨跌幅</th><th class="num">连板天数</th></tr></thead>
          <tbody>
            <tr v-for="(row, i) in stocks" :key="row.code">
              <td class="num muted">{{ i + 1 }}</td>
              <td>{{ row.name }}</td>
              <td class="muted">{{ row.code }}</td>
              <td class="num">{{ row.price }}</td>
              <td class="num" :class="toneClass(row.changePct)">{{ formatPct(row.changePct) }}</td>
              <td class="num">{{ row.limitUpStreak || '--' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="fav-empty" v-else>
        <div class="empty-box"></div>
        <div>{{ mainTab === 'stocks' ? '暂无自选股票' : '暂无自选题材' }}</div>
        <button class="empty-action" @click="addFavorite">+ 添加自选</button>
      </div>

      <div class="market-bottom">
        <button class="tab active">自选股</button>
        <button class="tab">新增分组</button>
        <span class="right"><button class="tool-btn">分组设置</button></span>
      </div>
      <div class="fav-foot">自选数据来自本地 API 契约 server（/app/self-optional/*）；未登录或未连接时为空，不伪造数据。</div>
    </div>
  </div>
</template>
