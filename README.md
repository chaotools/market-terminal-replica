# Market Terminal Replica

一个**题材领域级复刻**的 Electron 行情终端：按静态分析得到的运行方式与题材业务契约重建骨架，领域计算与数据源彻底分离。

仓库**只包含代码，不含任何演示或虚构数据**。没有接上数据源时，接口返回空快照、界面显示“未连接行情源”，不会退化成假数据。

## 这是什么 / 不是什么

**是**

- Electron 主进程 + preload 桥 + 本地打包的 Vue 3 SPA
- `shared/domain.mjs`：纯计算的题材领域引擎（热度、连板梯队、龙头、阶段、象限、轮动）
- `server/public-source.mjs` / `server/bridge-source.mjs`：把公开行情 / 桥接快照映射成领域 state 的数据源适配层
- 主进程拉起本地服务，按契约同形的 REST + SSE 推送聚合快照
- 单实例、托盘、窗口控制 IPC、版本检查、启动日志、打包/更新配置
- 题材工作台：题材树、题材详情、连板梯队、成分股、四象限、轮动日历、情报流

**不是**

- 不包含原程序的任何代码、素材、图标、字体或配置值
- 不连接原程序的服务端，也不内置任何行情数据
- 不实现登录、会员、支付、下单，不提供任何绕过手段

## 架构对应关系

| 原程序 | 本复刻 | 说明 |
| --- | --- | --- |
| `久赢恒丰.exe` (Electron) | `electron .` | 同一套 Electron 进程模型 |
| `resources/app.asar` | `out/` + `asar: true` | 业务代码打进 asar |
| `out/main/index.js` + `.jsc` | `out/main/index.js` | 明码 JS，未做字节码保护 |
| `out/preload/index.js` | `out/preload/index.js` | 暴露 `window.electron` |
| `window.electron.ipcRenderer.*` | `window.electron.*` | `contextBridge` 收窄通道 |
| 云端 `/app/*` 接口 | 本地 `http://127.0.0.1:8080/app/*` | 契约同形，自建实现 |
| socket.io 长连接 | SSE `/push` | 同为单向实时推送，零依赖 |
| `127.0.0.1:8080/8087/8088/8886` | 同名端口 | 主进程 fork 本地服务 |
| 单实例 / 托盘 / Alt+Z / 退出确认 | 同名实现 | 行为对齐 |
| NSIS + `app-update.yml` | `electron-builder.yml` | provider generic |
| `logs/main*.log` | `%APPDATA%/market-terminal-replica/logs/main.log` | 同类启动日志 |

> 原程序把主进程编译成 V8 字节码以隐藏逻辑。这里故意不做：字节码与 V8 版本强绑定，升级 Electron 会 `cachedDataRejected`。

## 领域引擎

`shared/domain.mjs` 只做派生，不含数据。输入 state 的结构：

```js
{
  subjectDefs: [{ id, name, sector }],
  stocks: { [code]: { code, name, subjectIds, price, changePct, limitUpStreak, ... } },
  flow: { [subjectId]: 0..1 },
  history: [{ date, subjects: { [id]: { heat, changePct, limitUpCount } } }],
  day, tick
}
```

对外函数：

| 函数 | 作用 |
| --- | --- |
| `deriveSubjects` | 题材热度 = 涨停家数 + 加权涨幅 + 成交额 + 连板高度 + 资金流向 |
| `deriveLadder` / `deriveMarketLadder` | 题材内 / 全市场连板梯队 |
| `deriveSubjectTree` | 按 sector 归并父级，用成分股并集聚合 |
| `deriveQuadrants` | 热度 × 涨幅四象限 |
| `deriveRotation` | 近 N 日热度矩阵 |
| `deriveRankings` / `deriveMarket` | 榜单与市场指标 |
| `detectEvents` | 对比前后快照，产出六类事件 |
| `toSnapshot` | 一次产出渲染层需要的全部结构 |

未连接数据源时 state 为空对象，所有函数返回空数组/零值，不会抛错也不会造数据。

## 数据源

复刻版不依赖任何第三方账号，提供三种可选数据模式：

| 模式 | 启动 | 说明 |
| --- | --- | --- |
| 公开行情源（推荐） | `npm run public` / `--public` | 新浪/东财公开接口：全 A 股约 5500+、概念/行业板块 220+、指数、五档、分时，约 10-15 秒轮询 |
| 快照桥接 | `npm run bridge` / `--bridge` | 加载 `server/bridge-fixtures.json`（原始应用明文抓包快照） |
| 空状态 | `node server/local-services.mjs` | 未连接数据源时不生成任何数据，界面显示“未连接行情源” |

公开源说明见 `server/public-source.mjs`，桥接说明见 `server/bridge-source.mjs`。
盘中数据一律带 `asOf` 与 `sessionState`，`GET /meta` 可查，界面顶部与状态栏同步展示。

## 题材图谱（横向思维导图）

原版「题材图谱」是 `vip-tree` + `HorizontalTree` 组件：从左到右分层的脑图，橙色圆角节点显示涨跌幅，
贝塞尔曲线连接，右侧配说明文字，带按涨幅/题材排名切换、一键展开、缩放。本复刻对齐了结构与交互：

- **`shared/domain.mjs` 的 `deriveSubjectGraph`**：以某题材为根，按**共享成分股数量（Jaccard 重合度）**
  找出关联题材作为二级，再挂各自的龙头成分股为三级。这贴合业务语义——一只股票属于多个题材，
  题材之间因共享成分股而关联。节点带 `reason`（如「与参股金融共享 160 只成分股」）、行业/情绪徽章。
- **`components/HorizontalTree.vue`**：SVG 贝塞尔连线 + 经典树布局（父节点对齐子节点中心），
  支持节点折叠/一键展开、缩放、拖拽平移、单击选中、双击进详情。涨红跌绿。
- **同页两个专业视图**：`RelationGraph.vue`（力导向关系网络，canvas 自绘，可拖拽/缩放/hover）、
  `DataTable.vue`（列配置、三态排序、固定列、虚拟滚动），对齐原版 ECharts graph + VXE-table 的能力。

```
GET /app/subject/graph-tree/:id   # 题材图谱树（题材→关联题材→成分股）
```

**工程化**：58 个路由组件全部改为动态 `import()` 分包，Vite `manualChunks` 拆出
`vendor-vue` / `vendor-router` / `vendor-pdf`，单页产物从 263KB 主包拆成主包 33KB + 各页面 2–18KB；
`DefaultLayout` 用 `keep-alive :max="12"` 缓存主界面（plain 子窗不缓存），对齐原版 Vue 工程实践。

## 题材层级与情报

**层级树**：题材按 `sector` 归并为父级，父级指标由子题材成分股并集派生（不是简单相加），
热度取子题材均值、涨跌幅按成交额加权、涨停与最高板按并集统计。

```
GET /app/subject/tree          # 全部板块 + 子题材完整指标
GET /app/subject/parents/:id   # 某题材归属的板块
```

**情报**：原程序的情报是掘金页的默认 tab，与盘前必读 / 涨停复盘 / 龙虎榜 / 精选 / 新题材 / 新事件
共用一个组件，靠 `topTab` 区分，列表走 `GET /app/subject/top-history`。

本复刻对齐了结构（分天分组、时间轴、题材名 + 涨跌幅、驱动因素标题、正文、来源、徽章），
但正文由行情派生而不是第三方资讯：

```
GET /app/subject/news          # 全部情报（倒序）
GET /app/subject/news/:id      # 单题材情报
```

| | 原程序 | 本复刻 |
| --- | --- | --- |
| 正文 | 服务端聚合的资讯源 | `detectEvents()` 由行情派生 |
| 标题 | 【驱动因素 / 驱动事件：…】 | 同结构 |
| 来源 | 财联社 / 搜狐 | 标注「本地行情引擎」 |

## 全量成分股与推送策略

股票池约 1800 只，完整 state 序列化会到数百 KB，因此拆成两条路径：

- **SSE 只推聚合**：题材、梯队、象限、轮动、榜单、市场指标，payload 约 11KB
- **题材详情按需拉**：`GET /app/subject/query/:id` 由服务端现算
- **行情刷新**：每 8 秒全量拉一次（80 只/批、4 路并发），池外涨停股单列补拉

## 快速开始

```bash
npm install
npm run build      # 生成 out/main + out/preload + out/renderer
npm start          # 启动 Electron 窗口
```

只看界面：

```bash
npm install --ignore-scripts
npm run build
node server/local-services.mjs   # 另开一个终端（空状态）
npm run serve                    # http://127.0.0.1:4173
```

## 目录结构

```
shared/domain.mjs              题材领域引擎（纯计算，无数据）
server/public-source.mjs       公开行情源（全A/板块/指数/分时）
server/bridge-source.mjs       桥接快照 → 领域 state
server/local-services.mjs      REST + SSE，8080/8087/8088/8886
src/main/index.js              主进程：单实例、窗口、托盘、IPC、日志
src/preload/index.js           contextBridge
src/renderer/src/data.js       数据接入（不生成数据）
src/renderer/src/components/   SubjectList / SubjectDetail / SubjectIntel /
                               QuadrantChart / RotationHeatmap / RankPanel /
                               MarketHeader / KLineChart / TitleBar
scripts/build.mjs              构建：vite 产物 + 主进程 + 图标
scripts/serve.mjs              静态预览
electron-builder.yml           打包与更新通道
```

## 继续做的方向

- 题材三级层级与自定义归类
- 情报落盘（当前重启会清空）
- 接真实资讯源，把情报来源换成真实媒体
- 接入 electron-updater 与自建更新服务器
- 用 `contextIsolation + sandbox` 进一步收紧 preload 暴露面
