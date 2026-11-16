# Market Terminal Replica

一个**题材领域级复刻**的 Electron 行情终端：照着上一轮静态分析出来的运行方式与题材业务契约，用自己写的代码重建了同构的骨架 **+ 题材领域模型与计算引擎**。

界面只是结果，核心在 `shared/domain.mjs`：题材热度、连板梯队、龙头识别、持续天数、领涨次数、阶段判定、四象限、轮动日历全部由成分股行情**实时计算**得出，而不是写死的展示数据。领域引擎是前后端同构的纯函数模块，与数据源解耦——接真实行情时只需替换行情输入，派生逻辑与界面都不用改。

**这是什么**

- Electron 主进程 + preload 桥 + 本地打包的 Vue 3 SPA
- `shared/domain.mjs`：题材领域模型（Subject / Stock / Ladder / Lead / Sustain / Quadrant / Rotation）
- 主进程拉起本地服务，按契约同形的 REST + SSE 推送领域快照
- 单实例、托盘、窗口控制 IPC、版本检查、启动日志、打包/更新配置
- 题材工作台：题材库、题材详情、连板梯队、成分股、四象限散点、轮动日历热力图、榜单与实时消息

**这不是什么**

- 不包含原程序的任何代码、素材、图标、字体或配置值
- 不连接 `app.txcfgl.com` 或任何第三方业务接口，题材与个股全部虚构（`示例·` 前缀 / `MKT0xx`）
- 不实现登录、会员、设备码、支付、真实行情，也不提供绕过手段
- 不是可直接分发的产品，是学习与二次开发的起点

## 题材领域模型

| 概念 | 实现 | 计算方式 |
| --- | --- | --- |
| 题材 Subject | 12 个虚构题材，含行业、成分股、热度 | 由成分股加权涨幅、涨停家数、成交额、连板高度、资金流向五项合成热度 |
| 成分股 Stock | 24 只虚构个股，每只归属 3 个题材 | 价格游走、封板/开板、封板时间、封单额、成交额、连板数 |
| 连板梯队 Ladder | 按 1板/2板/…/N板 分组 | 从个股 `limitUpStreak` 聚合，最高板与龙头一并派生 |
| 龙头 Lead | 每题材当前龙头 + 历史领涨次数 | 连板最高 → 首封最早 → 成交额最大 |
| 持续 Sustain | 持续天数、领涨次数、阶段 | 历史热度连续超阈值的天数；热度斜率 + 连板高度判定 萌芽/发酵/加速/分歧/退潮/主线 |
| 四象限 Quadrant | 热度 × 涨幅散点 | 以两项中位数切分四象限，点可点击跳转题材 |
| 轮动 Rotation | 14 日 × 12 题材热度矩阵 | 每 20 个 tick 换日并落一次历史快照 |
| 因子择时 Factor | 市场多空评分 | 上涨家数占比 + 平均涨幅归一化 |

`npm run check:domain` 是领域引擎的回归检查：推进 45 个 tick，打印热度前四、梯队、象限分布，并扫描全部输出里的 NaN/Infinity。

## 架构对应关系

| 原程序 | 本复刻 | 说明 |
| --- | --- | --- |
| `久赢恒丰.exe` (Electron) | `electron .` | 同一套 Electron 进程模型 |
| `resources/app.asar` | `out/` + `asar: true` | 业务代码打进 asar |
| `out/main/index.js` + `.jsc` | `out/main/index.js` | 明码 JS，未做字节码保护（见下） |
| `out/preload/index.js` | `out/preload/index.js` | 暴露 `window.electron` |
| `out/renderer/index.html` | `out/renderer/index.html` | Vite 产物，`base: './'` |
| `window.electron.ipcRenderer.*` | `window.electron.*` | 用 `contextBridge` 收窄了通道 |
| `https://app.txcfgl.com/api` | `http://127.0.0.1:8080/app/*` | 本地领域服务，不触网 |
| `/app/subject/list/v2`、`/realtime`、`/lead-times`、`/sustain-subject/v2` | 同名端点 | 契约同形，自建实现 |
| `/app/subject-limit-up-twice/{list,calendar,stock-list}` | 同名端点 | 梯队 / 轮动 / 连板池 |
| `/app/selected-subject/main/list/v2` | 同名端点 | 主线题材 |
| `/app/self-optional/group/subject-list` | 同名端点 | 自选题材分组 |
| `/app/stock/realtime-by-subject/v2` | 同名端点 | 题材成分股实时 |
| `/API/QuadrantCalculate`、`MarketHeat`、`MarketAttention`、`FactorTiming` | 同名端点 | 本地指标 API |
| socket.io 长连接 | SSE `/push` | 同为单向实时推送，零依赖 |
| `127.0.0.1:8080/8087/8088/8886` | 同名端口 | 主进程 fork 本地服务拉起 |
| 单实例 / 托盘 / Alt+Z / 退出确认 | 同名实现 | 行为对齐 |
| NSIS + `app-update.yml` | `electron-builder.yml` | provider generic、channel latest-x64 |
| `logs/main*.log` | `%APPDATA%/market-terminal-replica/logs/main.log` | 同类启动日志 |

> 原程序把主进程编译成 V8 字节码（`.jsc`）以隐藏逻辑。这里**故意不做**：字节码与 V8 版本强绑定，升级 Electron 会 `cachedDataRejected`。需要时可引入 electron-vite 的 bytecode 插件，把 `out/main/index.js` 换成 loader + `.jsc` 两文件即可。

## 数据源解耦

```
shared/domain.mjs   ← 唯一领域真相（前后端共用同一份 derive* 纯函数）
        ↑                        ↑
server/local-services.mjs    浏览器降级模式
  createInitialState()        createInitialState()
  advance() 每 1.5s           advance() 每 1.5s
  toSnapshot() → REST/SSE     toSnapshot() → 直接渲染
```

服务端把 `engine`（stocks / flow / day / tick）随快照下发，浏览器用**同一套** `deriveLadder / deriveSubjectStocks / deriveCandles` 计算题材详情。接真实数据源时，只需让 `createInitialState` / `advance` 消费真实行情（或改由服务端只下发 `engine`），其余全部不动。

浏览器里没有 `window.electron` 且 8080 不可用时，界面自动在浏览器内跑同一引擎，功能与视觉一致。

## 接入 Lumi 实时行情

本机同花顺 AI（Lumi）提供只读行情通道，服务端通过它的 `client_exec_script` 拉真实行情与题材成分，映射成 `shared/domain.mjs` 的 state 后由同一套领域逻辑计算。

```bash
node server/local-services.mjs                  # auto：能连就用实时，连不上降级模拟
REPLICA_SOURCE=mock node server/local-services.mjs    # 只用内置模拟
REPLICA_SOURCE=lumi node server/local-services.mjs    # 必须实时
REPLICA_LIVE_FORCE=1 node server/local-services.mjs   # 忽略 6 小时题材缓存，重新问财取成分
```

前置：客户端已启动并登录，`http://127.0.0.1:23816` 可访问。token 每次请求现读，
定位顺序为 `LUMI_TOKEN_FILE` 环境变量 → 自动发现 `~/lumi/users/*/mcp/auth-token.json`，
不缓存、不落盘、不写日志，仓库里不含任何个人路径。

### 能力边界（如实标注，不伪造）

| 数据 | 来源 | 说明 |
| --- | --- | --- |
| 现价 / 昨收 / 涨跌幅 / 开高低 / 量 / 额 | `realtime_query` | 字段 10 / 6 / 199112 / 7,8,9 / 13 / 19 |
| 题材成分股 | 问财 `xxx概念股` | 取返回的全部成分，不截断（合计 2568 只，跨题材去重后约 1800 只） |
| 连板天数 | 问财 `连续N天涨停` | 集合竞价时点该条件会返回空，此时退化为盘中实时判定 |
| 当日涨停名单 | 问财 `今日涨停` | 开盘后每 60 秒刷新，用于补全题材池外的涨停股 |
| 封板时间 / 封单额 | 通道不提供 | 界面显示 `—` |
| 日线历史 | 通道不提供 | K 线为示意；轮动日历按本机运行逐日累积 |

盘中数据一律带 `asOf` 与 `sessionState`（集合竞价 / 盘中未收盘 / 午间休市 / 非交易时段），
`GET /meta` 可查，界面顶部与状态栏同步展示，不当作收盘值使用。

## 题材层级与时间线

### 父子层级树

题材按 `sector` 归并为父级板块，父级指标由**子题材成分股并集**派生（不是简单相加）：

| 板块 | 子题材 | 成分（并集） |
| --- | --- | --- |
| 新能源 | 光伏、固态电池 | 842 |
| TMT | 半导体、数据要素、算力租赁、光模块 | 745 |
| 国防军工 | 军工 | 554 |
| 医药生物 | 创新药 | 275 |

父级热度取子题材均值，涨跌幅按成交额加权，涨停家数与最高板取并集统计。左栏按板块折叠，父行显示聚合指标。

```
GET /app/subject/tree          # 全部板块 + 子题材完整指标
GET /app/subject/parents/:id   # 某题材归属的板块
```

### 题材情报（对齐原程序情报板块）

原程序的情报不是独立页面，而是**掘金（excavate）**页的默认 tab，与盘前必读 / 涨停复盘 / 龙虎榜 / 精选 / 新题材 / 新事件共用一个组件 `SubjectNewsTimeLine`，靠 `topTab` 区分：

```js
// 情报(99) 不带 type，其它 tab 带 type=0/1/5/4/2/3
m.type = 99 == topTab ? null : topTab
// 列表：GET /app/subject/top-history（分页 pageNum/pageSize）
// 条目：subjectRankId / subjectId / subjectName / description(HTML) /
//       createTime / type(2=新题材,3=新事件) / red / pctChg
```

界面按 `createTime` 分天分组（“今天 2026-11-16 星期一”），滚动分页，双击进题材详情（会员校验），未登录题材名打码。

本项目的实现对齐了结构，但内容来源不同：

| | 原程序 | 本复刻 |
| --- | --- | --- |
| 正文 | 服务端聚合的资讯源（财联社、搜狐等） | `detectEvents()` 由行情派生 |
| 标题 | 【驱动因素 / 驱动事件：…】 | 同结构，由涨停/梯队/阶段/龙头/热度生成 |
| 来源 | 财联社 / 搜狐 | 标注「本地行情引擎」 |
| 涨跌幅 | 题材实时涨跌幅 | 同 |
| 徽章 | 新题材 / 新事件 | 新题材 / 新事件 / 系统 |

```
GET /app/subject/news          # 全部情报（倒序）
GET /app/subject/news/:id      # 单题材情报
```

**边界**：Lumi 通道没有资讯接口（`clientList` 只有导航/图表/自选/查询类工具），所以正文是行情派生，不是第三方资讯。界面底部已标注，不会伪造来源。

### 全量成分股下的推送策略

全量后股票池约 1800 只，完整 `engine` 序列化会到数百 KB，因此拆成两条路径：

- **SSE 只推聚合**：题材、梯队、象限、轮动、榜单、市场指标，payload 约 11KB
- **题材详情按需拉**：`GET /app/subject/query/:id` 由服务端现算，607 只成分约 220ms / 140KB
- **行情刷新**：每 8 秒全量拉一次（80 只/批、4 路并发），池外涨停股单列补拉，避免连板池出现 0%

```bash
npm run check:lumi     # 连通性 + 返回结构探测
npm run check:mapping  # 行情字段 → 领域 state 的映射回归（不联网）
```

## 快速开始

```bash
npm install
npm run build      # 生成 out/main + out/preload + out/renderer
npm start          # 启动 Electron 桌面窗口
```

只想看界面、不想装 Electron：

```bash
npm install --ignore-scripts   # 跳过 Electron 二进制下载
npm run build
npm run serve                  # http://127.0.0.1:4173
```

想同时看到"领域引擎在线"（而不是浏览器内引擎），另开一个终端：

```bash
node server/local-services.mjs
```

检查：`npm run check`（语法）与 `npm run check:domain`（领域引擎回归）。

## 目录结构

```
shared/domain.mjs              题材领域模型与计算引擎（前后端同构）
src/main/index.js              主进程：单实例、窗口、托盘、IPC、日志、拉起服务
src/preload/index.js           contextBridge 暴露受控 API
src/renderer/src/data.js       数据接入层：REST/SSE 与浏览器降级
src/renderer/src/components/   SubjectList / SubjectDetail / QuadrantChart /
                               RotationHeatmap / RankPanel / MarketHeader /
                               KLineChart / TitleBar
server/local-services.mjs      8080 REST + SSE、8087 缓存、8088 指标、8886 预留
scripts/build.mjs              构建：vite 产物 + 复制主进程/preload + 图标
scripts/check-domain.mjs       领域引擎回归检查
scripts/serve.mjs              静态预览服务
vite.config.mjs                渲染层构建配置（@shared 别名）
electron-builder.yml           打包与更新通道配置
```

## 继续做的方向

- 换真实数据源（自建服务或合规行情接口），只改行情输入层
- 补题材层级（父/子题材树）、集合竞价、题材新闻时间线、挖掘视图
- 引入路由与多窗口，把题材详情拆成独立页
- 接入 electron-updater 与自建更新服务器（把 `publish.url` 填上）
- 用 `contextIsolation + sandbox` 进一步收紧 preload 暴露面
