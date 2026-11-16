<script setup>
import { computed } from 'vue'
import KLineChart from './KLineChart.vue'

const props = defineProps({
  subject: { type: Object, default: () => ({}) },
  detail: { type: Object, default: () => ({ ladder: { tiers: [] }, stocks: [], candles: [], code: '' }) },
  marketLadder: { type: Object, default: () => ({ tiers: [], total: 0, highest: 0 }) }
})
defineEmits(['selectStock'])

const hhmm = (m) => m == null ? '—' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const amount = (v) => !v || !Number.isFinite(Number(v)) ? '—'
  : Number(v) >= 1e8 ? `${(Number(v) / 1e8).toFixed(2)}亿`
  : `${(Number(v) / 1e4).toFixed(0)}万`
const pct = (v) => `${v > 0 ? '+' : ''}${Number(v || 0).toFixed(2)}`
const cls = (v) => v > 0 ? 'up' : v < 0 ? 'down' : 'flat'

const trendPoints = computed(() => {
  const values = props.subject.trend || []
  if (values.length < 2) return ''
  const min = Math.min(...values) - 4
  const max = Math.max(...values) + 4
  const span = Math.max(1, max - min)
  return values.map((v, i) => {
    const x = (i / (values.length - 1)) * 400
    const y = 64 - ((v - min) / span) * 56
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
})
const trendLast = computed(() => {
  const values = props.subject.trend || []
  return values.length ? Number(values[values.length - 1]) : 0
})

const selectedStock = computed(() => {
  const list = props.detail.stocks || []
  return list.find((s) => s.code === props.detail.code) || list[0] || {
    code: '', name: '—', price: 0, changePct: 0, volume: 0
  }
})
</script>

<template>
  <section class="panel detail-panel">
    <div class="panel-head">
      <span>题材详情 · {{ subject.subjectName || '—' }}</span>
      <span class="hint">{{ subject.sector }} · {{ subject.subjectType }}</span>
    </div>
    <div class="panel-body detail-body">
      <div class="subject-hero">
        <div class="hero-main">
          <div class="hero-title">
            <b>{{ subject.subjectName }}</b>
            <span class="chip" :class="'stage-' + subject.stage">{{ subject.stage }}</span>
          </div>
          <div class="hero-numbers">
            <span class="hero-heat num">热度 <b>{{ Number(subject.heat || 0).toFixed(1) }}</b>
              <small :class="cls(subject.heatDelta)">{{ pct(subject.heatDelta) }}</small>
            </span>
            <span class="hero-pct num" :class="cls(subject.changePct)">{{ pct(subject.changePct) }}%</span>
          </div>
        </div>
        <div class="hero-metrics">
          <div><span>涨停家数</span><b class="num up">{{ subject.limitUpCount || 0 }}</b></div>
          <div><span>最高连板</span><b class="num">{{ subject.limitUpHeight || 0 }} 板</b></div>
          <div><span>连板家数</span><b class="num">{{ subject.limitUpTimesCount || 0 }}</b></div>
          <div><span>持续天数</span><b class="num">{{ subject.sustainDays || 0 }} 日</b></div>
          <div><span>领涨次数</span><b class="num">{{ subject.leadTimes || 0 }}</b></div>
          <div><span>成分股</span><b class="num">{{ subject.memberCount || 0 }}</b></div>
        </div>
        <div class="hero-lead">
          <span>当前龙头</span>
          <b>{{ subject.leadStock?.name || '—' }}</b>
          <span class="num">{{ subject.leadStock?.code || '' }} · {{ subject.leadStock?.limitUpStreak || 0 }} 板 · {{ pct(subject.leadStock?.changePct) }}%</span>
        </div>
      </div>

      <div class="trend-box">
        <div class="block-title"><span>热度趋势</span><span class="hint">近 {{ (subject.trend || []).length }} 个周期 · 当前 {{ Number(trendLast).toFixed(1) }}</span></div>
        <svg class="trend-svg" viewBox="0 0 400 70" preserveAspectRatio="none">
          <line x1="0" y1="20" x2="400" y2="20" stroke="#eef0f3" stroke-width="1"/>
          <line x1="0" y1="42" x2="400" y2="42" stroke="#eef0f3" stroke-width="1"/>
          <polyline :points="trendPoints" fill="none" stroke="#d63031" stroke-width="2" vector-effect="non-scaling-stroke"/>
        </svg>
      </div>

      <div class="ladder-box">
        <div class="block-title">
          <span>连板梯队</span>
          <span class="hint">共 {{ detail.ladder.total || 0 }} 家 · 最高 {{ detail.ladder.highest || 0 }} 板</span>
        </div>
        <div v-if="!detail.ladder.tiers || !detail.ladder.tiers.length" class="empty-hint">当前题材无涨停股，梯队空窗（见下方全市场连板）</div>
        <div v-else class="tier-row">
          <div v-for="tier in detail.ladder.tiers" :key="tier.key" class="tier-card">
            <div class="tier-head">{{ tier.key }} <span>{{ tier.stocks.length }} 家</span></div>
            <div v-for="s in tier.stocks" :key="s.code" class="tier-stock">
              <span class="tier-name">{{ s.name }}<i v-if="s.isLead" class="lead-tag">龙头</i></span>
              <span class="num">{{ s.price.toFixed(2) }} · {{ s.limitUpStreak }}板</span>
              <span class="tier-meta num">{{ hhmm(s.firstSealAt) }} 封 · 封单 {{ amount(s.sealAmount) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="market-ladder-box">
        <div class="block-title">
          <span>全市场连板</span>
          <span class="hint">共 {{ marketLadder.total || 0 }} 家 · 最高 {{ marketLadder.highest || 0 }} 板</span>
        </div>
        <div v-if="!marketLadder.tiers || !marketLadder.tiers.length" class="empty-hint">当前无连板股（盘前或已断板）</div>
        <div v-else class="tier-lines">
          <div v-for="tier in marketLadder.tiers" :key="tier.key" class="tier-line">
            <b>{{ tier.key }}</b>
            <span>{{ tier.stocks.map((s) => s.name).join('、') }}</span>
          </div>
        </div>
      </div>

      <div class="stock-box">
        <div class="block-title"><span>成分股实时行情</span><span class="hint">点击行查看个股 K 线</span></div>
        <div class="stock-head">
          <span>代码 / 名称</span><span>现价</span><span>涨跌幅</span><span>连板</span><span>首封</span><span>成交额</span>
        </div>
        <div
          v-for="s in detail.stocks"
          :key="s.code"
          class="stock-row"
          :class="{ active: s.code === detail.code }"
          @click="$emit('selectStock', s.code)"
        >
          <span><b>{{ s.name }}</b><small class="num">{{ s.code }}</small></span>
          <span class="num">{{ Number(s.price).toFixed(2) }}</span>
          <span class="num" :class="cls(s.changePct)">{{ pct(s.changePct) }}%</span>
          <span class="num">{{ s.limitUpStreak || '—' }}</span>
          <span class="num">{{ hhmm(s.firstSealAt) }}</span>
          <span class="num">{{ amount(s.turnover) }}</span>
        </div>
      </div>

      <div class="kline-box">
        <div class="block-title">
          <span>个股 K 线 · {{ selectedStock.name }}</span>
          <span class="hint">{{ detail.candles.length ? '日线' : '该通道不提供历史 K 线' }}</span>
        </div>
        <div v-if="detail.candles.length" class="kline-inner">
          <KLineChart :candles="detail.candles" :quote="selectedStock" />
        </div>
        <div v-else class="empty-hint">无日线数据</div>
      </div>
    </div>
  </section>
</template>
