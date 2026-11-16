<script setup>
import { computed } from 'vue'

const props = defineProps({
  market: { type: Object, default: () => ({}) },
  source: { type: String, default: 'none' },
  meta: { type: Object, default: () => ({}) }
})
const num = (v, n = 1) => Number(v || 0).toFixed(n)

const SESSION = {
  auction: '集合竞价',
  open: '盘中未收盘',
  lunch: '午间休市',
  closed: '非交易时段'
}
const sessionLabel = computed(() => SESSION[props.meta?.sessionState] || '—')
const sourceLabel = computed(() => ({
  lumi: '同花顺问财',
  none: '未连接'
}[props.source] || props.source))
const asOf = computed(() => props.meta?.asOf || '—')
const isLive = computed(() => props.source === 'lumi')
</script>

<template>
  <div class="market-header">
    <div class="mh-item">
      <span>市场热度</span>
      <b class="num">{{ num(market.heat) }}</b>
      <i class="mini-bar"><em :style="{ width: Math.min(100, market.heat || 0) + '%' }"></em></i>
    </div>
    <div class="mh-item">
      <span>市场关注度</span>
      <b class="num">{{ num(market.attention) }}%</b>
      <small>涨停占比</small>
    </div>
    <div class="mh-item">
      <span>因子择时</span>
      <b class="num" :class="market.factor >= 0.5 ? 'up' : 'down'">{{ num(market.factor, 2) }}</b>
      <small>{{ market.factor >= 0.5 ? '偏多' : '偏空' }}</small>
    </div>
    <div class="mh-item">
      <span>涨停家数</span>
      <b class="num up">{{ market.limitUpTotal || 0 }}</b>
      <small>最高 {{ market.maxHeight || 0 }} 板</small>
    </div>
    <div class="mh-item">
      <span>涨跌分布</span>
      <b class="num">{{ market.rising || 0 }}<small> / {{ market.total || 0 }}</small></b>
      <small>均涨 {{ num(market.avgPct, 2) }}%</small>
    </div>
    <div class="mh-stages">
      <span class="mh-label">阶段分布 · 第 {{ market.day || 0 }} 日 / tick {{ market.tick || 0 }}</span>
      <div class="chips">
        <span v-for="s in (market.stages || [])" :key="s.name" class="chip" :class="'stage-' + s.name">
          {{ s.name }} <b>{{ s.count }}</b>
        </span>
      </div>
    </div>
    <div class="mh-clock">
      <span class="mh-source" :class="isLive ? 'live' : 'off'">{{ sourceLabel }}</span>
      <span class="mh-asof num">{{ asOf }}</span>
      <span class="mh-session" :class="{ live: isLive }">{{ sessionLabel }}</span>
    </div>
  </div>
</template>
