# 代码审查报告：逻辑不通顺与不符合常理之处

审查日期：2026-11-16
方法：三个独立审查员分模块静态审查 + 主审用 Node 实测验证关键推断。

## ✅ 修复状态（2026-11-16 已完成）

用户明确项目定位为**开源演示项目、不强求接真实行情**，据此完成逐项修复：

| 编号 | 问题 | 处理 |
| --- | --- | --- |
| S1 | 连板天数退化为当日标记 | ✅ 新增确定性演示数据源 `server/demo-source.mjs`（默认），提供跨日连板 1–9 板；公开源明确标注"仅当日封板"能力边界 |
| S2 | history 时序致 heatDelta 恒零 | ✅ 演示源 history 只放已完成的昨日快照，delta 取真实上一帧；实测 58 题材 delta 全部非 0，发酵/退潮/事件复活 |
| S3 | 涨停阈值不认 ST 股 | ✅ `limitPctOf(code,name)` 按 ST 取 5%，改用涨停价（四舍五入到分）判定封板 |
| S4 | 会员权限只锁菜单不锁路由 | ✅ 路由守卫按菜单 `minAuth` 查表拦截；实测 `/svip-lead-stock` 被重定向到 `/buy-svip` |
| M1 | flow 死参数占 30% 权重 | ✅ 演示源生成有区分度的资金流 0..1，热度公式真正生效 |
| M2 | 阶段判定主线被分歧吞掉 | ✅ 主线（持续高温）前置，分歧加走弱条件；六阶段实测全分布 |
| M3 | 事件文案"升至"在降温时错误 | ✅ 按 heat 升降选"升至/降至" |
| M4 | 双 API 层口径不一 | ✅ 明确职责隔离并加注释（内部聚合 vs 契约 envelope） |
| M5 | refresh 失败降级失效 | ✅ 刷新循环显式设置 stale，UI 可感知；state 经 getter 读取避免滞后 |
| M6 | 双角色体系 | ✅ 明确 app.role 为唯一权限源，删除 user store 死的 isVip/isSvip getter |
| L1 | keep-alive 定时器泄漏 | ✅ keep-alive 排除带轮询/SSE 的页面；FavPage 补 onUnmounted 清理 |
| L2 | 三通道数据 | 保留（架构分层需要），已在代码注释明确各通道用途 |
| L3 | readLocalFile 路径穿越 | ✅ 限定只读 out/resources 与 userData 目录 |
| L4 | 文档表述 | ✅ README 更新 demo 模式、能力边界、下单表述 |
| L5 | 8886 空监听 | ✅ README 明确说明（架构对齐刻意行为） |
| L6 | 图谱折叠图标反向 | ✅ 图标与折叠状态统一由 `isCollapsed` 驱动 |
| L7 | formatPrice 死代码 | ✅ 简化 |
| L8 | clockTimer 死代码 | ✅ 删除 |

**验证**：`npm run check`、`npm test`（19/19，含 6 条新增回归测试）、`npm run build` 全通过；端到端实测快照六阶段分布、连板 9 板、heatDelta 非零、6 个核心接口 200。

---

（以下为原始审查发现，保留作档案）

结论：**架构分层是清楚的，但存在 4 个严重问题：连板天数是假的、history 时序导致 heatDelta 恒零、涨停阈值不认 ST 股、会员权限只锁菜单不锁路由。另有 6 个中等、8 个轻微问题。**

---

## 严重：会让核心功能失效

### S1. 连板天数是假的——整套连板业务退化为当日涨停标记
**位置**：`server/public-source.mjs:98` `limitUpStreak: pct >= limitPctOf(code) ? 1 : 0`
**问题**：公开源只能拿到当日涨跌幅，代码把"今天是否涨停"直接塞进 `limitUpStreak`（连板天数）。这个值永远只会是 0 或 1，**不可能出现 2 板、3 板**。
**连带后果**（`shared/domain.mjs`）：
- 连板梯队 `deriveLadder` 永远只有"1板"一档，2板/3板/... 是死代码（:108-125）
- 龙头识别 `limitUpStreak` 排序失效，退化成按涨幅挑（:52-55）
- 热度公式 `0.18 * clamp(limitUpHeight/5)` 里 limitUpHeight 恒 ≤1，这一项最多 0.036（:47）
- `limitUpTimesCount`（≥2板家数）永远 0（:41）
- 阶段"加速"要求 `limitUpHeight>=4`（:72），**永远无法进入**
**建议**：要么明确标注"公开源不支持连板，梯队一律 1 板"并在 UI 说明；要么用逐日快照在服务端维护连续涨停天数的推演（需要跨日持久化）。

### S2. history 写入时序错误 → heatDelta 恒为 0，事件/阶段功能大面积失效
**位置**：`server/public-source.mjs:311-316` 与 `shared/domain.mjs:30,44,61`
**问题**：`rebuildState()` 先算当前 heat → 把**当前帧** push 进 history → 再 `state = next`。之后 `deriveSubjects` 取 `prevRow = history[last]` 拿到的是**自己这一帧**，所以 `heatDelta = heat - prevHeat = 0` 恒成立。
**实测验证**：同一 state，push 当前帧后 `delta=0`；push 旧帧（heat=10）后 `delta=22.2`。
**连带后果**：
- `阶段`里 `delta>2→发酵`、`delta<-5→退潮` 两支永假（:73,74）
- `detectEvents` 的"热度拉升"、"阶段切换"事件永远不触发
- `sustainDays` 把当天算进去，少一天都不对
**建议**：push 上一帧的 heat 而非当前帧；或把 history 写入放到派生之后、以下一轮的 prev 身份存在。

### S3. 涨停阈值对 ST/创业板/北交所判断错误
**位置**：`server/public-source.mjs:64-68,98`
**问题**：`limitPctOf` 只按代码前缀判断（300/301/688/689→19.8%，8/4/92→29.8%，其余→9.8%），忽略了**ST 股涨跌停幅度为 5%**。名字含 ST 的主板股票涨到 5% 被当作涨停，实际不是；涨到 9.8% 又判不出。
**建议**：`mapStock` 里根据 `name` 含 `ST`/`*ST` 覆盖为 4.8%（留 0.2 容差），并设置合理的容差处理四舍五入。

### S4. 会员权限形同虚设——路由守卫只查登录不查等级
**位置**：`src/renderer/src/router/index.js:installGuards`、`src/renderer/src/menu.js:canAccess`
**问题**：菜单用 `canAccess(app.role, minAuth)` 给 SVIP 入口加锁并显示锁定态，但 `beforeEach` 守卫**只检查 `user.token`，完全不校验 `minAuth`**。用户直接在地址栏输入 `#/svip/...` 就能绕过菜单进入所有会员页。而且 `app.role` 默认是 `'vip'` 却能在 UI 里随意切换到 svip，无持久化、无校验。
**说明**：本复刻是本地演示、不涉及真实权益，但"菜单锁了、URL 能进"是明显不自洽的逻辑。
**建议**：守卫里补 `to.meta.minAuth` 校验并重定向到 BuyPage；或干脆去掉菜单锁，明确"所有页面可自由浏览"，不要半锁半开。

---

## 中等：逻辑不自洽 / 口径不一致

### M1. flow 资金流向从未被填充，却占热度 30% 权重
**位置**：`shared/domain.mjs:48` `0.30 * clamp(flow[def.id] ?? 0.5)`
**问题**：全项目搜索 `flow[` 只有这一处读取，public/bridge 两个数据源都把 `flow: {}` 写死。结果是 221 个题材的热度里都加了**完全相同的常数 0.15**，既不区分题材也不随行情变化，是白占 30% 权重的死参数。
**建议**：要么删掉这一项并把权重归一化到其余四项；要么从成交额/量比派生一个真实的资金流指标填进 flow。

### M2. 阶段判定顺序导致"主线"被"分歧"吞掉
**位置**：`shared/domain.mjs:72-77`
**问题**：`heat>=55 && delta<0.5 → 分歧` 排在 `sustainDays>=3 && heat>=55 → 主线` 之前。一个持续 3 天热度 60、今天微降的题材，本应是"主线"，却先命中"分歧"。而且"分歧"的业务含义是高位放量滞涨，这里只看 heat 高+delta 小，把正常横盘的主线误判掉。
**建议**：把"主线"分支提前，且给"分歧"加上量产/换手条件；或让阶段由多因子打分而非 if-else 顺序。

### M3. 题材涨幅按成交额加权会掩盖普跌
**位置**：`shared/domain.mjs:35-38`
**问题**：题材 changePct 按成分股成交额加权。一只权重股大涨、其余成分普跌时，题材显示上涨，与"涨停家数""梯队"等指标方向矛盾。成交额 weighting 本身没错，但缺少等权或中位数口径的交叉展示，用户会看到"题材涨了但成分股大多在跌"。
**建议**：同时派生 `medianChangePct` 或 `upRatio`，在 UI 展示，避免单一口径误导。

### M4. 双 API 层并存，同一路径两种响应结构
**位置**：`server/local-services.mjs:216-359`（route，裸对象）与 `:365-595`（apiData，envelope `{code,msg,data}`）
**问题**：`/app/subject/list/v2`、`/app/subject/realtime` 等路径在两层都实现，但结构不同。前端 `data.js` 用绝对地址打 8080 根路径拿裸对象，`api/client.js` 打 8080/api 拿 envelope。两套口径长期并存，任何一处改动都可能造成页面数据不一致。
**建议**：统一到 envelope 一套；或明确 route 是"内部聚合"、apiData 是"契约仿真"，在注释和路径前缀上彻底隔离。

### M5. refresh 异常时降级逻辑失效，stale 标记无消费者
**位置**：`server/local-services.mjs:641-647`
**问题**：`publicEngine.refresh()` 抛错时只设置 `meta.stale=true; meta.lastError=...`，既不回退到上一次成功 state，也不通知前端，界面继续显示旧数据且标着正常状态。
**建议**：SSE 推送里带 stale 标记，UI 显示"数据已过期"；连续失败 N 次清空 state 或降级空状态。

### M6. 两套角色体系并存，一套是死状态
**位置**：`src/renderer/src/stores.js`（app.role vs user.userInfo.vip/svip）
**问题**：`useUserStore` 定义了 `isVip`/`isSvip` getter 和 `userInfo.vip.isVip` 等字段，但**全项目无人读取**；真正生效的是 `useAppStore.role`（11 处引用）。BuyPage 购买后调 `app.setRole()`，从不更新 `user.userInfo`。两套体系彼此独立、互不同步。
**建议**：删掉 user store 里那套死字段，统一到 app.role；或让两者真正联动。

---

## 轻微：体验 / 文档 / 边界

### L1. keep-alive 下多个页面定时器未清理
**位置**：`src/renderer/src/views/FavPage.vue:44-48`（无 onUnmounted）、LoginPage/FindPwdPage/UserPwdPage 倒计时定时器无清理
**问题**：`DefaultLayout` 用 `keep-alive :max=12` 缓存页面。组件 deactivated 时 `onUnmounted` 不触发，FavPage 的 15 秒轮询会继续在后台跑，造成无谓请求与状态错乱。倒计时定时器在组件被缓存期间继续跑，切回来时已归零。
**建议**：用 `onActivated`/`onDeactivated` 启停定时器，或统一在 onUnmounted 之外补 deactivated 清理。

### L2. 前端三条数据通道并存
**位置**：`data.js`（8080 根路径，fetchJson）、`api/client.js`（8080/api，envelope）、`connectStream`（8080/push，SSE）
**问题**：同一份题材数据有三条获取路径，快照、详情、榜单的来源不统一。预览模式（4173）下 SSE 能连但部分 fetch 因跨域/时序失败时，页面会出现"部分有数据部分空"的诡异状态。
**建议**：合并为单一数据入口，SSE 只做推送触发、数据统一走一条 fetch 通道。

### L3. readLocalFile 无目录白名单
**位置**：`src/main/index.js:340-351`
**问题**：只校验扩展名 `.pdf` 和大小 20MB，没有目录限制。渲染层（含 webview 加载的内容）可让主进程读取本机任意 PDF 并 base64 回传。本地演示应用风险有限，但属于权限边界设计缺陷。
**建议**：限制只读 `out/resources/sample.pdf` 或用户通过对话框显式选择的文件。

### L4. 文档表述与实现有出入
**位置**：`README.md:22` "不实现登录、会员、支付、下单"
**问题**：代码里有 LoginPage、BuyPage（本地模拟订单）、角色切换、"会员权益预览"。虽然都是本地模拟、不接真实支付，但"不实现下单"的表述不准确。
**建议**：改为"不接入真实支付与权益校验，仅提供本地模拟流程"。

### L5. 四端口中 8886 是空监听
**位置**：`server/local-services.mjs:622`
**问题**：8886 返回 `{role:'reserved', note:'预留端口，暂无服务'}`，仅为对齐原程序端口而监听，没有实际内容。
**说明**：这是架构对齐的刻意行为，不算 bug，但应在 README 中明确说明，避免误解为功能缺失。

### L6. 题材图谱折叠按钮图标与状态相反
**位置**：`src/renderer/src/components/HorizontalTree.vue:39-40,88,117,133`
**问题**：默认 `level>=2` 的节点是**收起**的（`defaultCollapsed=true`），但折叠按钮显示 `−`（展开图标），因为按钮只判断 `collapsed[n.key]`（初始 undefined）。用户点一次 `toggle()` 把 undefined 变成 true（仍收起），要点两次才展开。同时"一键收起"按钮在初始（已有部分收起）状态就显示，文案与状态不符。
**建议**：按钮显示统一用 `isOpen(n)` 的结果判断；`toggle()` 基于当前实际状态取反，而非 `!collapsed[key]`。

### L7. formatPrice 三个分支返回完全相同的值
**位置**：`src/renderer/src/format.js:20-24`
**问题**：`if(abs>=1000) return n.toFixed(2); if(abs>=10) return n.toFixed(2); return n.toFixed(2)` ——三个分支逻辑完全相同，是复制粘贴残留的死代码。
**建议**：简化为 `return n.toFixed(2)`，或按原意实现不同精度（如大数用万/亿单位）。

### L8. clockTimer 声明但从未启动
**位置**：`src/renderer/src/layout/DefaultLayout.vue:18,44`
**问题**：`let clockTimer = null` 并有 `clearInterval(clockTimer)`，但全文件无 `setInterval` 赋值，是死代码。
**说明**：无功能影响，属于残留。

---

## 附：已确认合理、看似可疑的点

- **四象限用中位数切分**（domain:deriveQuadrants）：符合业务直觉，保留。
- **无数据源时返回空快照而非 mock**：符合 README 声明与用户要求，保留。
- **图谱用共享成分股派生关联**：是合理的产品定义，与原版人工维护的题材关联不同但自洽。

## 建议修复顺序

1. **S2**（heatDelta 时序）——一处改动可恢复发酵/退潮/事件三个功能，性价比最高
2. **S1**（连板口径）——决定整个梯队/龙头/阶段是否可信，需要在数据能力与 UI 表述间做决策
3. **M1**（flow 死参数）+ **M2**（阶段顺序）——让热度与阶段真的反映行情
4. **S3**（ST 涨停阈值）——影响涨停家数准确性
5. 其余按优先级逐步处理
