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





































const placeholder = (title, stage, apis, notes, origin) => ({
  name: title,
  component: () => import('../views/PagePlaceholder.vue'),
  meta: { title, stage: stage || 'P1', apis: apis || [], notes: notes || [], origin }
})

const routes = [
  {
    path: '/',
    component: DefaultLayout,
    children: [
      { path: '', name: 'Home', component: () => import('../views/HomeRedirect.vue'), meta: { title: '首页', auth: 1 } },

      { path: 'login', name: 'Login', component: () => import('../views/LoginPage.vue'), meta: { title: '登录', auth: 0, plain: true, hidden: true } },
      { path: 'find-pwd', name: 'FindPwdIndex', component: () => import('../views/FindPwdPage.vue'), meta: { title: '找回密码', auth: 0, plain: true, hidden: true } },
      { path: 'update', name: 'Update', component: () => import('../views/UpdatePage.vue'), meta: { title: '版本更新', auth: 0, plain: true, hidden: true } },
      { path: 'notification', name: 'Notification', component: () => import('../views/MessagePage.vue'), meta: { title: '消息显示', auth: 0, plain: true, hidden: true } },
      { path: 'preview-pdf', name: 'PreviewPdf', component: () => import('../views/PdfPage.vue'), meta: { title: 'PDF预览', auth: 0, plain: true, hidden: true } },
      { path: 'message', name: 'MessageIndex', component: () => import('../views/MessagePage.vue'), meta: { title: '消息通知', auth: 1 } },

      { path: 'poster', name: 'Poster', component: () => import('../views/PosterPage.vue'), meta: { title: '海报', auth: 1, stage: 'P2', hidden: true } },
      { path: 'issues', name: 'IssuesIndex', component: () => import('../views/IssuesPage.vue'), meta: { title: '问董秘', auth: 1, stage: 'P2' } },
      { path: 'research-report', name: 'ResearchReportIndex', component: () => import('../views/ResearchReportPage.vue'), meta: { title: '研究报告', auth: 1, stage: 'P2' } },
      { path: 'live', name: 'Live', component: () => import('../views/LivePage.vue'), meta: { title: '播放', auth: 0, stage: 'P2' } },
      { path: 'course-his', name: 'CourseHis', component: () => import('../views/CourseHisPage.vue'), meta: { title: '历史课程', auth: 0, stage: 'P2' } },
      { path: 'fav', name: 'FavMain', component: () => import('../views/FavPage.vue'), meta: { title: '自选股', auth: 1, stage: 'P0' } },
      { path: 'fav/grid', name: 'FavGrid', component: () => import('../views/FavGridPage.vue'), meta: { title: '自选股', auth: 1, stage: 'P2' } },

      { path: 'market-trend', redirect: '/market-trend/main' },
      { path: 'market-trend/main', name: 'MarketTrendMain', component: () => import('../views/MarketTrendMain.vue'), meta: { title: '全部A股', auth: 1, stage: 'P0' } },
      { path: 'market-trend/stock/quotation/:id', name: 'StockQuotation', component: () => import('../views/StockQuotationPage.vue'), meta: { title: '股票详情', auth: 1, stage: 'P0' } },
      { path: 'market-trend/subject/quotation/:id', name: 'SubjectQuotation', component: () => import('../views/SubjectDetailPage.vue'), meta: { title: '题材详情', auth: 1, stage: 'P2', tab: 'rank' } },
      { path: 'market-trend/composite-index/quotation/:id', name: 'CompositeIndexQuotation', component: () => import('../views/IndexQuotationPage.vue'), meta: { title: '指数详情', auth: 1, stage: 'P2' } },
      { path: 'market-trend/test', ...placeholder('test', 'P2', [], ['原始调试页，用途未明']), meta: { title: 'test', auth: 1, hidden: true, stage: 'P2' } },

      { path: 'trend', name: 'TrendMain', component: () => import('../views/TrendMain.vue'), meta: { title: '市场走势', auth: 1, stage: 'P0' } },
      { path: 'monitors-market', name: 'MonitorsMarket', component: () => import('../views/MonitorMarketPage.vue'), meta: { title: '甄选盯盘', auth: 1, stage: 'P2' } },
      { path: 'lecturer', name: 'Lecturer', component: () => import('../views/LecturerPage.vue'), meta: { title: '投资圈', auth: 1, stage: 'P2' } },
      { path: 'practical-train', name: 'PracticalTrain', component: () => import('../views/LecturerPage.vue'), meta: { title: '实训团', auth: 1, stage: 'P2', lecturerId: 3 } },
      { path: 'investment-train', name: 'InvestmentTrain', component: () => import('../views/LecturerPage.vue'), meta: { title: '智投团', auth: 1, stage: 'P2', lecturerId: 10 } },

      { path: 'subject', redirect: '/subject/excavate' },
      { path: 'subject/excavate', name: 'SubjectViewExcavate', component: () => import('../views/SubjectExcavatePage.vue'), meta: { title: '题材掘金', auth: 1, stage: 'P0' } },
      { path: 'subject/periodic', name: 'SubjectViewPeriodic', component: () => import('../views/SubjectPeriodicPage.vue'), meta: { title: '题材轮动', auth: 1, stage: 'P0' } },
      { path: 'subject/all', name: 'SubjectViewAll', component: () => import('../views/SubjectAllPage.vue'), meta: { title: '全部题材', auth: 1, stage: 'P0' } },
      { path: 'subject/detail/:subjectId', name: 'SubjectDetailIndex', component: () => import('../views/SubjectDetailPage.vue'), meta: { title: '题材详情', auth: 1, stage: 'P0', tab: 'rank' } },
      { path: 'subject/detail/:subjectId/desc', name: 'SubjectDetailDesc', component: () => import('../views/SubjectDetailPage.vue'), meta: { title: '题材介绍', auth: 1, stage: 'P1', tab: 'intro' } },
      { path: 'subject/detail/:subjectId/vip-table', name: 'SubjectDetailVipTable', component: () => import('../views/SubjectDetailPage.vue'), meta: { title: '题材排名', auth: 1, stage: 'P1', tab: 'rank' } },
      { path: 'subject/detail/:subjectId/vip-tree', name: 'SubjectDetailVipTree', component: () => import('../views/SubjectDetailPage.vue'), meta: { title: '题材图谱', auth: 1, stage: 'P1', tab: 'tree' } },
      { path: 'subject/detail/:subjectId/svip-rank', name: 'SubjectDetailSvipRank', component: () => import('../views/SubjectDetailPage.vue'), meta: { title: '题材排名', auth: 1, stage: 'P1', tab: 'rank' } },
      { path: 'subject/detail/:subjectId/kline', name: 'SubjectDetailKline', component: () => import('../views/SubjectDetailPage.vue'), meta: { title: '题材K线', auth: 1, stage: 'P1', tab: 'rank' } },
      { path: 'subject-periodogram', name: 'SubjectPeriodogram', component: () => import('../views/SubjectPeriodogramPage.vue'), meta: { title: '题材周期图', auth: 1, stage: 'P2' } },

      { path: 'svip-subject/detail/:subjectId', name: 'SvipSubjectDetailIndex', component: () => import('../views/SubjectDetailPage.vue'), meta: { title: '甄选题材详情', auth: 1, stage: 'P2', tab: 'rank' } },
      { path: 'svip-subject/detail/:subjectId/desc', name: 'SvipSubjectDetailDesc', component: () => import('../views/SubjectDetailPage.vue'), meta: { title: '甄选题材介绍', auth: 1, stage: 'P2', tab: 'intro' } },
      { path: 'svip-subject/detail/:subjectId/table', name: 'SvipSubjectDetailVipTable', component: () => import('../views/SubjectDetailPage.vue'), meta: { title: '甄选题材排名', auth: 1, stage: 'P2', tab: 'rank' } },
      { path: 'svip-subject/detail/:subjectId/stock', name: 'SvipSubjectDetailStock', component: () => import('../views/SubjectDetailPage.vue'), meta: { title: '甄选题材个股', auth: 1, stage: 'P2', tab: 'rank' } },
      { path: 'svip-subject/detail/:subjectId/kline', name: 'SvipSubjectDetailKline', component: () => import('../views/SubjectDetailPage.vue'), meta: { title: '题材K线', auth: 1, stage: 'P2', tab: 'rank' } },
      { path: 'svip-lead-stock', name: 'SvipLeadStock', component: () => import('../views/LeadStockPage.vue'), meta: { title: '甄选股池', auth: 1, stage: 'P2' } },
      { path: 'svip-ding-loong', name: 'SvipDingLoong', component: () => import('../views/SvipSimplePage.vue'), meta: { title: '二板定龙', auth: 1, stage: 'P2', svipKind: 'dingloong' } },
      { path: 'svip-subject-main/svip', name: 'SvipSubjectMain', component: () => import('../views/SvipSimplePage.vue'), meta: { title: '甄选题材', auth: 1, stage: 'P2', svipKind: 'subject' } },
      { path: 'svip-subject-main/svip-longhu', name: 'SvipLongHu', component: () => import('../views/SvipSimplePage.vue'), meta: { title: '龙虎榜', auth: 1, stage: 'P2', svipKind: 'longhu' } },
      { path: 'svip-subject-main/call-auction', name: 'SvipCallAuction', component: () => import('../views/SvipSimplePage.vue'), meta: { title: '竞价优选', auth: 1, stage: 'P2', svipKind: 'auction' } },
      { path: 'svip-subject-main/monitoring', redirect: '/svip-subject-main/monitoring/lead' },
      { path: 'svip-subject-main/monitoring/lead', name: 'SvipMonitorLead', component: () => import('../views/SubjectMonitorPage.vue'), meta: { title: '领涨题材', auth: 1, stage: 'P2', kind: 'lead' } },
      { path: 'svip-subject-main/monitoring/up', name: 'SvipMonitorUp', component: () => import('../views/SubjectMonitorPage.vue'), meta: { title: '晋级题材', auth: 1, stage: 'P2', kind: 'up' } },
      { path: 'svip-subject-main/monitoring/line', name: 'SvipMonitorLine', component: () => import('../views/SubjectMonitorPage.vue'), meta: { title: '主线题材', auth: 1, stage: 'P2', kind: 'line' } },
      { path: 'svip-subject-main/monitoring/continuous', name: 'SvipMonitorContinuous', component: () => import('../views/SubjectMonitorPage.vue'), meta: { title: '持续题材', auth: 1, stage: 'P2', kind: 'continuous' } },

      { path: 'dpu', name: 'DpuMain', component: () => import('../views/DpuPage.vue'), meta: { title: '战法库', auth: 1, stage: 'P1' } },

      { path: 'buy-qz', name: 'BuyQz', component: () => import('../views/BuyPage.vue'), meta: { title: '圈子', auth: 1, stage: 'P1', plan: 'qz' } },
      { path: 'buy-vip', name: 'BuyVip', component: () => import('../views/BuyPage.vue'), meta: { title: '题材库会员', auth: 1, stage: 'P1', plan: 'vip' } },
      { path: 'buy-svip', name: 'BuySvip', component: () => import('../views/BuyPage.vue'), meta: { title: '甄选版', auth: 1, stage: 'P1', plan: 'svip' } },

      { path: 'user', redirect: '/user/profile' },
      { path: 'user/profile', name: 'UserProfile', component: () => import('../views/UserProfilePage.vue'), meta: { title: '我的资料', auth: 1, stage: 'P1' } },
      { path: 'user/order', name: 'UserOrder', component: () => import('../views/UserOrderPage.vue'), meta: { title: '我的订单', auth: 1, stage: 'P1' } },
      { path: 'user/pwd', name: 'UserPwd', component: () => import('../views/UserPwdPage.vue'), meta: { title: '修改密码', auth: 1, stage: 'P1' } },
      { path: 'user-complain', name: 'UserComplain', component: () => import('../views/ComplainPage.vue'), meta: { title: '一键投诉', auth: 1, stage: 'P2' } },

      { path: 'privacy', ...placeholder('隐私政策', 'P1', [], ['本地复刻版说明：不收集、不上传任何数据；所有数据来自本地 API 契约 server。']), meta: { title: '隐私政策', auth: 0, hidden: true, plain: false, stage: 'P1' } }
    ]
  },
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('../views/NotFoundPage.vue'), meta: { title: '404', auth: 0, plain: true, hidden: true } }
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
