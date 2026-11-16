/**
 * 三级导航配置（照原始应用 bundle 内嵌菜单结构复刻：6 组一级 / 32 项二级）。
 * 原始字段：label/path/index/roles/minAuth/visible/iconPath；图标在本复刻中省略为文字徽标。
 * minAuth: none | vip | training | svip | ssvip
 */

export const ROLE_ORDER = { none: 0, vip: 1, training: 2, svip: 3, ssvip: 4 }

export const ROLE_LABEL = {
  none: '普通用户',
  vip: '题材库会员',
  training: '实训团',
  svip: '甄选版',
  ssvip: '战法库'
}

export function canAccess(role, minAuth) {
  return (ROLE_ORDER[role] ?? 0) >= (ROLE_ORDER[minAuth || 'none'] ?? 0)
}

export const MENU_GROUPS = [
  {
    index: 1,
    label: '行情报价',
    items: [
      { index: '1-3', label: '市场走势', path: '/trend', minAuth: 'none' },
      { index: '1-1', label: '自选股', path: '/fav', minAuth: 'none' },
      { index: '1-4', label: '全部A股', path: '/market-trend/main', minAuth: 'none' }
    ]
  },
  {
    index: 2,
    label: '题材库',
    items: [
      { index: '2-1', label: '题材掘金', path: '/subject/excavate', minAuth: 'none' },
      { index: '2-2', label: '题材轮动', path: '/subject/periodic', minAuth: 'vip', badge: 'VIP' },
      { index: '2-5', label: '全部题材', path: '/subject/all', minAuth: 'vip', badge: 'VIP' },
      { index: '2-6', label: '问董秘', path: '/issues', minAuth: 'vip', badge: 'VIP' },
      { index: '2-7', label: '研究报告', path: '/research-report', minAuth: 'vip', badge: 'VIP' }
    ]
  },
  {
    index: 3,
    label: '甄选版',
    items: [
      { index: '3-8', label: '甄选盯盘', path: '/monitors-market', minAuth: 'vip' },
      { index: '3-9', label: '市场周期图', path: '/trend?his=1', minAuth: 'vip' },
      { index: '3-5', label: '题材周期图', path: '/subject-periodogram', minAuth: 'vip' },
      { index: '3-11', label: '题材监控', path: '/svip-subject-main/monitoring/lead', minAuth: 'svip', badge: 'SVIP' },
      { index: '3-1', label: '甄选股池', path: '/svip-lead-stock', minAuth: 'svip', badge: 'SVIP' },
      { index: '3-4', label: '甄选题材', path: '/svip-subject-main/svip', minAuth: 'svip', badge: 'SVIP' },
      { index: '3-12', label: '龙虎榜', path: '/svip-subject-main/svip-longhu', minAuth: 'svip', badge: 'SVIP' },
      { index: '3-3', label: '二板定龙', path: '/svip-ding-loong', minAuth: 'svip', badge: 'SVIP' },
      { index: '3-2', label: '实训团', path: '/practical-train', minAuth: 'training', badge: '实训' },
      { index: '3-6', label: '战法库', path: '/dpu', minAuth: 'ssvip', badge: 'SSVIP' }
    ]
  },
  {
    index: 4,
    label: '投资圈',
    items: [{ index: '4-1', label: '投资圈', path: '/lecturer', minAuth: 'none' }]
  },
  {
    index: 5,
    label: '系统设置',
    items: [
      { index: '5-1', label: '修改密码', path: '/user/pwd', minAuth: 'none' },
      { index: '5-2', label: '系统升级', path: '/update', minAuth: 'none' },
      { index: '5-3', label: '隐私政策', action: 'privacy', minAuth: 'none' },
      { index: '5-5', label: '用户设置', path: '/user/profile', minAuth: 'none' },
      { index: '5-6', label: '退出登录', action: 'logout', minAuth: 'none' }
    ]
  },
  {
    index: 6,
    label: '投诉与调解',
    items: [{ index: '6-1', label: '一键投诉', path: '/user-complain', minAuth: 'none' }]
  }
]

/** 依据当前 path 找所属一级菜单。 */
export function groupForPath(path) {
  const clean = String(path || '').split('?')[0]
  for (const group of MENU_GROUPS) {
    for (const item of group.items) {
      if (!item.path) continue
      const itemPath = item.path.split('?')[0]
      if (clean === itemPath || clean.startsWith(itemPath + '/')) return group
    }
  }
  if (clean.startsWith('/subject/detail')) return MENU_GROUPS[1]
  return MENU_GROUPS[0]
}
