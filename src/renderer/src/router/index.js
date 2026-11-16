/**
 * 路由表：依据原始渲染层静态分析（60 条命名路由）复刻。
 * - hash 模式（与原应用一致）
 * - meta.auth：1 需要登录 / 0 公开
 * - meta.plain：登录/更新/消息/PDF 等子窗页面隐藏主导航与标签栏
 * - meta.stage：该页面的复刻阶段（P0/P1/P2）
 * - 多数页面当前为 PagePlaceholder，按阶段逐项替换为真实页面。
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import { desktopInvoke } from '../data.js'
import DefaultLayout from '../layout/DefaultLayout.vue'
import HomeRedirect from '../views/HomeRedirect.vue'
import PagePlaceholder from '../views/PagePlaceholder.vue'
import LoginPage from '../views/LoginPage.vue'
import UpdatePage from '../views/UpdatePage.vue'
import MessagePage from '../views/MessagePage.vue'
import FindPwdPage from '../views/FindPwdPage.vue'
import PdfPage from '../views/PdfPage.vue'
import NotFoundPage from '../views/NotFoundPage.vue'

import SubjectDetailPage from '../views/SubjectDetailPage.vue'
import TrendMain from '../views/TrendMain.vue'
import MarketTrendMain from '../views/MarketTrendMain.vue'
import FavPage from '../views/FavPage.vue'
import SubjectExcavatePage from '../views/SubjectExcavatePage.vue'
import SubjectPeriodicPage from '../views/SubjectPeriodicPage.vue'
import SubjectAllPage from '../views/SubjectAllPage.vue'
import StockQuotationPage from '../views/StockQuotationPage.vue'
import UserProfilePage from '../views/UserProfilePage.vue'
import UserOrderPage from '../views/UserOrderPage.vue'
import UserPwdPage from '../views/UserPwdPage.vue'
import DpuPage from '../views/DpuPage.vue'
import BuyPage from '../views/BuyPage.vue'

const placeholder = (title, stage, apis, notes, origin) => ({
  name: title,
  component: PagePlaceholder,
  meta: { title, stage: stage || 'P1', apis: apis || [], notes: notes || [], origin }
})

const routes = [
  {
    path: '/',
    component: DefaultLayout,
    children: [
      { path: '', name: 'Home', component: HomeRedirect, meta: { title: '首页', auth: 1 } },

      { path: 'login', name: 'Login', component: LoginPage, meta: { title: '登录', auth: 0, plain: true, hidden: true } },
      { path: 'find-pwd', name: 'FindPwdIndex', component: FindPwdPage, meta: { title: '找回密码', auth: 0, plain: true, hidden: true } },
      { path: 'update', name: 'Update', component: UpdatePage, meta: { title: '版本更新', auth: 0, plain: true, hidden: true } },
      { path: 'notification', name: 'Notification', component: MessagePage, meta: { title: '消息显示', auth: 0, plain: true, hidden: true } },
      { path: 'preview-pdf', name: 'PreviewPdf', component: PdfPage, meta: { title: 'PDF预览', auth: 0, plain: true, hidden: true } },
      { path: 'message', name: 'MessageIndex', component: MessagePage, meta: { title: '消息通知', auth: 1 } },

      { path: 'poster', ...placeholder('海报', 'P2', [], ['原始：iframe 显示 ?url= 海报页'], '/poster'), meta: { title: '海报', auth: 1, hidden: true, stage: 'P2' } },
      { path: 'issues', ...placeholder('问董秘', 'P1', ['/app/stock/qa', '/app/stock/qa/v2', '/app/stock/qa/rank'], ['问答列表（增量拉取 10 条）', '排名视图']), meta: { title: '问董秘', auth: 1, stage: 'P1' } },
      { path: 'research-report', ...placeholder('研究报告', 'P1', ['/app/stock-report/v2/list', '/app/stock-report/v2/rank'], ['研报列表：keyword/日期区间/分页', 'rows 含 title/content/pdfUrl，可用 openPDF 打开']), meta: { title: '研究报告', auth: 1, stage: 'P1' } },
      { path: 'live', ...placeholder('播放', 'P2', ['/app/lecturer/live-info/:id', '/app/video/vod-play-info/:vid', '/app/video/watch-time/end'], ['Aliplayer 直播/点播', 'broadcast-room 直播事件总线']), meta: { title: '播放', auth: 0, stage: 'P2' } },
      { path: 'course-his', ...placeholder('历史课程', 'P2', ['/app/lecturer/his/course/list'], ['课程历史列表']), meta: { title: '历史课程', auth: 0, stage: 'P2' } },
      { path: 'fav', name: 'FavMain', component: FavPage, meta: { title: '自选股', auth: 1, stage: 'P0' } },
      { path: 'fav/grid', ...placeholder('自选股多股同列', 'P1', ['/app/self-optional/group/stock-list', '/app/stock/realtime'], ['多股同列网格']), meta: { title: '自选股', auth: 1, stage: 'P1' } },

      { path: 'market-trend', redirect: '/market-trend/main' },
      { path: 'market-trend/main', name: 'MarketTrendMain', component: MarketTrendMain, meta: { title: '全部A股', auth: 1, stage: 'P0' } },
      { path: 'market-trend/stock/quotation/:id', name: 'StockQuotation', component: StockQuotationPage, meta: { title: '股票详情', auth: 1, stage: 'P0' } },
      { path: 'market-trend/subject/quotation/:id', ...placeholder('题材详情报价', 'P1', ['/app/subject/query/:id'], ['题材维度报价页']), meta: { title: '题材详情', auth: 1, stage: 'P1' } },
      { path: 'market-trend/composite-index/quotation/:id', ...placeholder('指数详情', 'P1', ['/app/stock/indexConstituentStocks', '/API/IndexCalculate'], ['指数行情与成分股']), meta: { title: '指数详情', auth: 1, stage: 'P1' } },
      { path: 'market-trend/test', ...placeholder('test', 'P2', [], ['原始调试页，用途未明']), meta: { title: 'test', auth: 1, hidden: true, stage: 'P2' } },

      { path: 'trend', name: 'TrendMain', component: TrendMain, meta: { title: '市场走势', auth: 1, stage: 'P0' } },
      { path: 'monitors-market', ...placeholder('甄选盯盘', 'P2', ['/app/stock/single-yellow/v2', '/app/realtime/stock-realtime-data'], ['甄选版盯盘页']), meta: { title: '甄选盯盘', auth: 1, stage: 'P2' } },
      { path: 'lecturer', ...placeholder('投资圈', 'P2', ['/app/lecturer/subscribe', '/app/lecturer/article', '/app/lecturer/course/list'], ['讲师主页/文章/课程/直播']), meta: { title: '投资圈', auth: 1, stage: 'P2' } },
      { path: 'practical-train', ...placeholder('实训团', 'P2', [], ['复用讲师组件 lecturer-id=3']), meta: { title: '实训团', auth: 1, stage: 'P2' } },
      { path: 'investment-train', ...placeholder('智投团', 'P2', [], ['复用讲师组件 lecturer-id=10']), meta: { title: '智投团', auth: 1, stage: 'P2' } },

      { path: 'subject', redirect: '/subject/excavate' },
      { path: 'subject/excavate', name: 'SubjectViewExcavate', component: SubjectExcavatePage, meta: { title: '题材掘金', auth: 1, stage: 'P0' } },
      { path: 'subject/periodic', name: 'SubjectViewPeriodic', component: SubjectPeriodicPage, meta: { title: '题材轮动', auth: 1, stage: 'P0' } },
      { path: 'subject/all', name: 'SubjectViewAll', component: SubjectAllPage, meta: { title: '全部题材', auth: 1, stage: 'P0' } },
      { path: 'subject/detail/:subjectId', name: 'SubjectDetailIndex', component: SubjectDetailPage, meta: { title: '题材详情', auth: 1, stage: 'P0', tab: 'rank' } },
      { path: 'subject/detail/:subjectId/desc', name: 'SubjectDetailDesc', component: SubjectDetailPage, meta: { title: '题材介绍', auth: 1, stage: 'P1', tab: 'intro' } },
      { path: 'subject/detail/:subjectId/vip-table', name: 'SubjectDetailVipTable', component: SubjectDetailPage, meta: { title: '题材排名', auth: 1, stage: 'P1', tab: 'rank' } },
      { path: 'subject/detail/:subjectId/vip-tree', name: 'SubjectDetailVipTree', component: SubjectDetailPage, meta: { title: '题材图谱', auth: 1, stage: 'P1', tab: 'tree' } },
      { path: 'subject/detail/:subjectId/svip-rank', name: 'SubjectDetailSvipRank', component: SubjectDetailPage, meta: { title: '题材排名', auth: 1, stage: 'P1', tab: 'rank' } },
      { path: 'subject/detail/:subjectId/kline', name: 'SubjectDetailKline', component: SubjectDetailPage, meta: { title: '题材K线', auth: 1, stage: 'P1', tab: 'rank' } },
      { path: 'subject-periodogram', ...placeholder('题材周期图', 'P2', ['/app/subject/history-cycle/:type'], ['上证/深证/创业板周期图']), meta: { title: '题材周期图', auth: 1, stage: 'P2' } },

      { path: 'svip-subject/detail/:subjectId', ...placeholder('甄选题材详情', 'P2', ['/app/selected-subject/query/:id', '/app/subject/all-lead-times'], ['desc/table/stock/kline 四个子页签']), meta: { title: '甄选题材详情', auth: 1, stage: 'P2' } },
      { path: 'svip-subject/detail/:subjectId/table', ...placeholder('甄选题材排名', 'P2', ['/app/selected-subject/main/list/v2'], ['排名表']), meta: { title: '甄选题材排名', auth: 1, stage: 'P2' } },
      { path: 'svip-lead-stock', ...placeholder('甄选股池', 'P2', ['/app/stock/stock-pool-config', '/app/stock/pick-rank-day/v2/:subjectId/:type'], ['甄选股池列表']), meta: { title: '甄选股池', auth: 1, stage: 'P2' } },
      { path: 'svip-ding-loong', ...placeholder('二板定龙', 'P2', ['/app/subject-limit-up-twice/list', '/app/subject-limit-up-twice/calendar', '/app/subject-limit-up-twice/stock-list'], ['二板定龙梯队/日历']), meta: { title: '二板定龙', auth: 1, stage: 'P2' } },
      { path: 'svip-subject-main/svip', ...placeholder('甄选题材', 'P2', ['/app/selected-subject/main/list/v2'], ['甄选题材列表']), meta: { title: '甄选题材', auth: 1, stage: 'P2' } },
      { path: 'svip-subject-main/svip-longhu', ...placeholder('龙虎榜', 'P2', ['/app/stock/long-hu/list', '/app/stock/long-hu/date_list_with_model', '/app/stock/long-hu/stock/hot-net'], ['龙虎榜日期/个股/席位']), meta: { title: '龙虎榜', auth: 1, stage: 'P2' } },
      { path: 'svip-subject-main/call-auction', ...placeholder('竞价优选', 'P2', ['/app/realtime/stock-call-auction-data', '/app/stock/single-yellow/v2'], ['集合竞价优选']), meta: { title: '竞价优选', auth: 1, stage: 'P2' } },
      { path: 'svip-subject-main/monitoring', redirect: '/svip-subject-main/monitoring/lead' },
      { path: 'svip-subject-main/monitoring/lead', ...placeholder('领涨题材', 'P2', ['/app/selected-subject/realtime'], ['领涨题材监控']), meta: { title: '领涨题材', auth: 1, stage: 'P2' } },
      { path: 'svip-subject-main/monitoring/up', ...placeholder('晋级题材', 'P2', ['/app/selected-subject/realtime'], ['晋级题材监控']), meta: { title: '晋级题材', auth: 1, stage: 'P2' } },
      { path: 'svip-subject-main/monitoring/line', ...placeholder('主线题材', 'P2', ['/app/selected-subject/realtime'], ['主线题材监控']), meta: { title: '主线题材', auth: 1, stage: 'P2' } },
      { path: 'svip-subject-main/monitoring/continuous', ...placeholder('持续题材', 'P2', ['/app/subject/sustain-subject/v2'], ['持续题材监控']), meta: { title: '持续题材', auth: 1, stage: 'P2' } },

      { path: 'dpu', name: 'DpuMain', component: DpuPage, meta: { title: '战法库', auth: 1, stage: 'P1' } },

      { path: 'buy-qz', name: 'BuyQz', component: BuyPage, meta: { title: '圈子', auth: 1, stage: 'P1', plan: 'qz' } },
      { path: 'buy-vip', name: 'BuyVip', component: BuyPage, meta: { title: '题材库会员', auth: 1, stage: 'P1', plan: 'vip' } },
      { path: 'buy-svip', name: 'BuySvip', component: BuyPage, meta: { title: '甄选版', auth: 1, stage: 'P1', plan: 'svip' } },

      { path: 'user', redirect: '/user/profile' },
      { path: 'user/profile', name: 'UserProfile', component: UserProfilePage, meta: { title: '我的资料', auth: 1, stage: 'P1' } },
      { path: 'user/order', name: 'UserOrder', component: UserOrderPage, meta: { title: '我的订单', auth: 1, stage: 'P1' } },
      { path: 'user/pwd', name: 'UserPwd', component: UserPwdPage, meta: { title: '修改密码', auth: 1, stage: 'P1' } },
      { path: 'user-complain', ...placeholder('一键投诉', 'P2', ['/app/complaint-link/list', '/app/complaint-link/menu-click-log'], ['原始 webview 加载 BC_PC 投诉链接']), meta: { title: '一键投诉', auth: 1, stage: 'P2' } },

      { path: 'privacy', ...placeholder('隐私政策', 'P1', [], ['本地复刻版说明：不收集、不上传任何数据；所有数据来自本地 API 契约 server。']), meta: { title: '隐私政策', auth: 0, hidden: true, plain: false, stage: 'P1' } }
    ]
  },
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFoundPage, meta: { title: '404', auth: 0, plain: true, hidden: true } }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

export function installGuards(routerInstance, { user, tags }) {
  routerInstance.beforeEach((to) => {
    const needAuth = to.meta?.auth !== 0
    if (needAuth && !user.token) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }
    // 允许已登录用户直接访问 /login（便于验证登录页与切换账号）
    return true
  })
  routerInstance.afterEach((to) => {
    const channel = to.path === '/login' ? 'setLoginSize' : 'setMainSize'
    try { desktopInvoke(channel) } catch { /* 非桌面环境 */ }
    tags.add(to)
  })
}

export default router
