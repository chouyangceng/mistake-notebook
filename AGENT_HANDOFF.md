# 拾题 · Agent 迭代交接记录

这个文件用于给后续 agent 快速接手项目。每次功能更新结束后，都要在这里追加一条记录，写清楚更新内容、更新方向、涉及文件、数据结构和后续可迭代点。

## 2026-08-09 · 归类编辑弹窗与卡片轻展示

### 更新内容

- 每张错题卡新增「修改归类」按钮，可以直接改科目、模块、单元、知识点和标签。
- 新增独立的归类编辑弹窗，和新建错题弹窗分开，避免把题干、答案和分类逻辑搅在一起。
- 归类保存后会重置今日题单快照，让滚动计划按新归类重新计算。
- 卡片继续保持轻展示：默认只显示题干摘要、科目、模块和复习次数；学习档案与答案仍然按需展开。
- `README.md`、`使用说明书.md` 和页面内使用指引都已同步补充这条路径。

### 涉及文件

- `app.js`
- `index.html`
- `styles.css`
- `README.md`
- `使用说明书.md`
- `AGENT_HANDOFF.md`

### 数据/接口变化

- 没有新增本地存储 key。
- 归类编辑直接修改现有题目字段：
  - `subject`
  - `module`
  - `unit`
  - `topic`
  - `tags`
- 保存后会刷新 `shiti-dayplan`，确保今日复习题单重新排布。

### 后续可迭代点

- 批量改归类。
- 给标签做多选管理和常用标签面板。
- 把归类编辑和搜索联动，做“筛选后批量整理”。

## 2026-08-09 · Windows 同步地址展示与一键复制

### 更新内容

- Windows Electron 主进程继续保留本地同步接收器，默认端口仍是 `17332`。
- 通过 `preload.js` 把 Windows 主库的同步地址暴露给前端。
- 「使用指引」页新增同步地址展示区，会列出：
  - `127.0.0.1` 本机回环地址
  - 当前机器的局域网地址
- 新增「复制 Windows 地址」按钮，方便安卓端直接填地址同步。
- 更新 `README.md` 和 `使用说明书.md`，把这个流程写成了实际可操作步骤。

### 涉及文件

- `main.js`
- `preload.js`
- `index.html`
- `app.js`
- `README.md`
- `使用说明书.md`
- `AGENT_HANDOFF.md`

### 数据/接口变化

- 新增 Electron 预加载桥接：

```js
window.shitiSync.getInfo()
```

- 返回结构大致为：

```js
{
  port: 17332,
  loopback: "http://127.0.0.1:17332",
  lanUrls: ["http://192.168.x.x:17332"]
}
```

### 下一步

- 可以继续给安卓端加“扫一扫 Windows 地址”的入口。
- 也可以把同步地址展示迁移成二维码，减少手输。

## 2026-08-09 · Windows 主库同步接收器与使用说明书

### 更新内容

- 在 Windows Electron 主进程里加了一个局域网同步接收器，默认监听 `17332` 端口。
- 安卓端可以把同步地址填成 `http://Windows局域网IP:17332`，把错题、计划和附件正文推回 Windows。
- 同步接收器会把最新同步包保存到 Electron 的 `userData/sync-store.json`。
- 新增 `使用说明书.md`，把 Windows / 安卓 / 同步 / 备份 / 排错步骤整理成可直接使用的说明。
- 更新 `README.md`，把这套 Windows 主库 + 安卓随身端的方式写明。

### 涉及文件

- `main.js`
- `README.md`
- `使用说明书.md`
- `AGENT_HANDOFF.md`

### 数据/接口变化

- Windows 主进程新增同步存储文件：

```text
<userData>/sync-store.json
```

- 该文件保存最近一次完整同步包，结构和前端同步协议一致。
- 同步接收器支持：
  - `GET`：返回当前同步包
  - `POST`：写入新的同步包并回传保存后的结果

### 下一步

- 可以继续给安卓端加一个更直观的“扫描 Windows 地址”入口。
- 可以把 Windows 同步接收器做成可配置端口，避免和别的服务冲突。
- 如果要跨公网使用，再往账号体系和冲突解决上加一层。

## 2026-08-09 · 四科轮转模板与配置驱动计划

### 更新内容

- 把今日复习的计划行从“只看已有题目”改成“优先按科目配置里的模块生成”，这样即使某模块当前还没录多少题，也能先把每日计划摆出来。
- 增加四科轮转模板，能直接套用“数学 / 英语 / 政治 / 专业课”阶段式配额。
- 继续强化今日复习页的逻辑：
  - 每道题依然保存复习次数、复习历史和最后复习时间
  - 排题仍优先次数少、到期的题
  - 计划会随着 `subjectConfig` 改变而自动重算

### 涉及文件

- `app.js`
- `README.md`
- `AGENT_HANDOFF.md`

### 数据/接口变化

- `planCombos()` 现在先读取 `subjectConfig` 里的模块，再把题库里实际出现但还没在配置中的模块补进去。
- `planSig()` 已包含 `subjectConfig`，所以改模块配置会触发重新生成今日题单。
- 新增滚动模板：

```js
['四科轮转：数英政专', ...]
```

### 下一步

- 如果要继续细化，可以把“每日计划”拆成按科目单独设定，直接做成 `数学 6 / 英语 3 / 政治 2 / 专业课 1` 这种界面。
- 也可以把模块删改做完整，补上重命名和删除入口。

## 2026-08-09 · 四科模块化和滚动复习增强

### 更新内容

- 在现有多页面框架里新增 `科目配置` 页面，集中管理四科模块选项、滚动模板和标签建议。
- 把错题录入从“科目 + 单元”扩展为“科目 + 模块 + 单元 + 知识点 + 标签”。
- 默认四科模块：
  - 数学：高数、线性代数、概率论
  - 英语：错误单词卡片、好词好句、优秀翻译、长难句
  - 政治：马原、史纲、毛中特、思修
  - 专业课：章节错题、概念辨析、案例分析
- 每道题新增复习统计：
  - `reviewCount`
  - `reviewHistory`
  - `lastReviewedAt`
- 今日复习题单优先级改为：
  - 到期题优先
  - 复习次数少的题优先
  - 再参考等待时间和难度
- 新增滚动模板按钮，支持类似“高数 10 题”“高数 5 + 线代 5”的阶段式配额。
- 导出/导入/同步协议都开始携带 `subjectConfig`，保证跨端时模块配置不会丢。
- 更新 `README.md`，把新页面和新字段写进去。

### 涉及文件

- `index.html`
- `app.js`
- `styles.css`
- `README.md`
- `AGENT_HANDOFF.md`

### 数据/接口变化

新增本地配置：

```js
localStorage["shiti-subject-config"]
```

结构大致为：

```js
{
  数学: ["高数", "线性代数", "概率论"],
  英语: ["错误单词卡片", "好词好句", "优秀翻译", "长难句"],
  政治: ["马原", "史纲", "毛中特", "思修"],
  专业课: ["章节错题", "概念辨析", "案例分析"]
}
```

新增错题字段：

```js
{
  module: String,
  tags: String[],
  reviewCount: Number,
  reviewHistory: Array<{ date, at, result, afterDays, nextReview }>,
  lastReviewedAt: String
}
```

同步包新增字段：

```js
{
  deviceId,
  sync,
  subjectConfig,
  questions,
  plan,
  done,
  dayPlan,
  assets
}
```

### 已知限制

- 模块配置现在支持手动追加，但还没有“删除模块/重命名模块”的专门 UI。
- 今日复习仍是启发式排题，够用，但还不是完整的长周期间隔重复算法。
- 当前同步仍然依赖外部 HTTP 接口，没有账号系统。

### 下一步

- 给科目配置页加“编辑 / 删除模块”。
- 给今日复习页加“按科目分别设置每天看几题”的更细粒度模板。
- 如果后面要做真正多端同步，建议补冲突解决策略和账号体系。

## 2026-08-08 · 多页面导航与使用指引

### 更新内容

- 给应用新增 `使用指引` 页面，作为功能总览入口。
- 把当前功能拆成四个可切换页面：`错题库`、`今日复习`、`学习洞察`、`使用指引`。
- 新增 `guideFeatures`、`guideSteps`、`guideFlow`、`brainstormIdeas` 这组数据驱动说明内容。
- `使用指引` 页面展示现有功能、使用路径、逻辑架构和头脑风暴方向。
- `使用指引` 页面新增 `数据接口` 和 `同步与备份` 区，能直接配置同步地址、保存用户标识、导入/导出备份。
- 导航按钮现在带显式 `data-title`，切页标题更清晰。
- 更新 `README.md`，说明页面结构。

### 涉及文件

- `index.html`
- `app.js`
- `styles.css`
- `README.md`
- `AGENT_HANDOFF.md`

### 数据/接口变化

- 新增渲染数据数组：

```js
guideFeatures
guideSteps
guideFlow
brainstormIdeas
```

- 新增页面元素：

```html
#guideView
#guideFeatures
#guideSteps
#guideFlow
#guideIdeas
#guideData
#syncEndpointInput
#syncUserInput
#saveSyncConfig
#syncNowGuide
#importBackupBtn
#exportBackupBtn
#backupFileInput
#guideTotal
#guideToday
#guideSync
#guideSyncHint
```

- 新增交互函数：

```js
renderGuide
saveSyncConfig
downloadBackup
importBackupFile
applyImportedState
```

### 已知限制

- 当前仍是单页应用里的多页面切换，不是多个独立 HTML 文件。
- 指引页是静态说明加少量实时数据，后续可以继续做成更完整的帮助中心。
- 导入备份会覆盖当前本地数据，属于显式确认操作。

### 下一步

- 如果需要真正“多页面路由”，可以再拆成独立页面。
- 指引页可以继续加搜索、快捷入口和每个功能的示例截图。
- 架构页后续可以补成更清晰的流程图或 Mermaid 图。

## 2026-08-08 · 修复安全、存储和每日计划问题

### 更新内容

- 重写 `app.js` 的渲染输出，对用户输入内容统一做 HTML 转义，降低存储型 XSS 风险。
- 附件从 `localStorage` 挪到 IndexedDB：错题中只保存附件元数据，附件正文保存在 `shiti-assets/files`。
- 增加每日计划快照 `shiti-dayplan`，当天计划不会每次渲染随意重排。
- 增加每日完成记录 `shiti-done`，点击“不会 / 模糊 / 掌握”后题目会从今日剩余列表移除。
- 配额超过每日总量时，在界面上提示“前面的分类会优先排入”。
- 导出备份改为导出 `{ questions, plan, done, dayPlan, sync, assets }`。
- 更新 `README.md`，说明 IndexedDB 和每日完成记录。

### 涉及文件

- `app.js`
- `README.md`
- `AGENT_HANDOFF.md`

### 数据/接口变化

`localStorage["shiti-questions"]` 中的附件字段新结构：

```js
attachment: null | {
  id: String,
  name: String,
  type: String
}
```

历史数据里可能仍存在旧结构：

```js
attachment: {
  name: String,
  type: String,
  data: String
}
```

当前 `app.js` 仍兼容旧图片附件显示，但新保存的附件会走 IndexedDB。

新增 `localStorage["shiti-dayplan"]`：

```js
{
  date: "YYYY-MM-DD",
  sig: String,
  ids: Number[]
}
```

新增 `localStorage["shiti-done"]`：

```js
{
  "YYYY-MM-DD": Number[]
}
```

新增 IndexedDB：

```js
database: "shiti-assets"
store: "files"
key: attachment.id
value: {
  id: String,
  name: String,
  type: String,
  data: String
}
```

### 已知限制

- 当前已经支持完整备份导出和导入；后续如果要上云，同步后端仍需要做冲突合并和权限控制。
- 每日计划快照会在题库或计划设置变化时重新生成；这对原型够用，但严格学习记录场景可以再加“手动重新生成计划”按钮。
- 当前 PDF 仍只作为附件保存，没有解析、裁剪或题目/答案区域拆分。

### 下一步

- 加编辑/删除错题，并同步清理无用 IndexedDB 附件。
- Electron 版落地后，考虑把数据迁移到本地 JSON 文件或 SQLite。

## 2026-08-08 · PWA 与可插拔同步协议

### 更新内容

- 给应用加了 `manifest.webmanifest`、`sw.js` 和 `icon.svg`，开始支持 PWA 安装与离线缓存。
- `打开错题本.command` 改成启动本地静态服务，再打开浏览器地址，避免 `file://` 导致 service worker 不可用。
- `app.js` 增加 `deviceId`、`userId`、`updatedAt`、`version`、`deletedAt` 等同步准备字段。
- 新增最小同步协议：前端把 `{ deviceId, sync, questions, plan, done, dayPlan, assets }` POST 到配置的同步地址。
- 新增 `syncNow()` 和 `renderSync()`，可以在 UI 上配置同步地址并手动同步。
- 导出 JSON 现在包含附件正文 `assets`。

### 涉及文件

- `index.html`
- `app.js`
- `styles.css`
- `manifest.webmanifest`
- `sw.js`
- `icon.svg`
- `打开错题本.command`
- `README.md`

### 数据/接口变化

- `localStorage["shiti-device-id"]`：当前设备标识。
- `localStorage["shiti-sync"]`：同步配置，字段：

```js
{
  endpoint: String,
  userId: String,
  lastSync: String,
  deviceId: String
}
```

- 同步请求体：

```js
{
  deviceId,
  sync,
  questions,
  plan,
  done,
  dayPlan,
  assets
}
```

- 服务端若返回同结构 JSON，前端会尽量合并。

### 已知限制

- 现在还没有真正接入 Firebase/Supabase；同步地址需要后端自己提供。
- 当前同步接口是“最小协议”，还没有冲突解决 UI，也没有登录。
- `service worker` 只在 `http/https` 下工作，所以必须通过本地服务或线上地址打开。

### 下一步

- 选定一个后端服务（Firebase / Supabase / 自建 HTTP API）并实现同步地址。
- 做冲突合并规则 UI，比如“保留本地 / 保留远端 / 自动合并”。
- 把导入功能补出来，让导出包可以直接恢复。

## 2026-08-08 · 建立交接记录

### 更新内容

- 新增本文件 `AGENT_HANDOFF.md`，作为后续迭代的固定交接入口。
- 记录当前产品状态、核心数据结构、已知限制和下一步方向。

### 当前产品状态

- 项目位置：`/Users/chenyc/Desktop/错题本-考研版`
- 运行入口：`打开错题本.command` 或 `index.html`
- 当前形态：本地 HTML/CSS/JS 应用，带 Electron 打包脚手架。
- 数据保存：错题文字、计划、完成记录在 `localStorage`；附件正文在 IndexedDB；不联网。
- 已实现能力：
  - 按科目、单元、知识点整理错题。
  - 错题卡片先展示题目，再点击展示答案、反思、奥技/结论。
  - 支持 PDF/截图作为错题附件；图片可预览，PDF 以附件名记录；新附件正文保存在 IndexedDB。
  - 今日复习支持“不会 / 模糊 / 掌握”，分别安排 1 / 3 / 7 天后复习。
  - 今日复习计划支持每日总量，以及按“科目 · 单元”设置配额。
  - 配额不足时自动用更该刷的旧题补齐。
  - 支持导出 JSON 备份。

### 关键文件

- `index.html`：页面结构、错题库/今日复习/学习洞察/新建错题弹窗。
- `styles.css`：全部界面样式。
- `app.js`：状态、渲染、错题保存、附件导入、复习计划算法。
- `main.js`：Electron 主进程入口。
- `package.json`：Electron 打包配置。
- `README.md`：面向用户的运行和打包说明。

### 本地数据接口

`localStorage["shiti-questions"]` 保存错题数组。单条错题结构：

```js
{
  id: Number,
  subject: String,
  unit: String,
  topic: String[],
  title: String,
  question: String,
  answer: String,
  reflection: String,
  conclusion: String,
  attachment: null | {
    id: String,
    name: String,
    type: String
  },
  difficulty: Number,
  date: String,
  revealed: Boolean,
  nextReview: String | undefined
}
```

`localStorage["shiti-plan"]` 保存每日复习计划：

```js
{
  dailyTotal: Number,
  rows: {
    "科目|||单元": Number
  }
}
```

### 复习计划逻辑

- `buildTodayPlan()` 生成今日题单。
- 先按 `plan.rows["科目|||单元"]` 取题。
- 再用全局池补足 `dailyTotal`。
- 排序优先级：已到期题优先，其次下一次复习时间更近，其次难度更高，其次更早的 id。
- 点击“不会 / 模糊 / 掌握”后更新 `nextReview`，并重新渲染计划。

### 已知限制

- 当前还没有真正解析 PDF 内容，只把 PDF 作为本地附件保存。
- JSON 导出已包含附件正文 `assets`，但后续如果要做加密或分片上传，还需要再拆一层备份协议。
- 当前 EXE 未在本机打包，因为环境没有可用的 `npm/npx`；Electron 配置已准备好。
- 复习算法是轻量启发式，不是完整间隔重复模型。

### 下一步方向

- 增加“计划完成记录”，按日期保存每天完成了哪些题。
- 增加导入备份功能，与现有导出 JSON 配套。
- 增加编辑/删除错题。
- Electron 版落地后，把数据从 `localStorage` 迁移到本地 JSON 文件或 SQLite。
- PDF 截图可以进一步做区域裁剪：题目图、答案图分开保存。

### 后续更新记录规则

每次迭代结束后追加一节，建议格式：

```md
## YYYY-MM-DD · 简短标题

### 更新内容
- ...

### 涉及文件
- ...

### 数据/接口变化
- ...

### 下一步
- ...
```
## 2026-08-09 项目整体审查

- 新增 `项目审查报告.md`，记录当前版本的 P0/P1/P2 问题、影响和建议顺序。
- 最高优先级是局域网同步鉴权与冲突合并；当前服务可被同网设备无认证读写，整包同步也可能覆盖计划/完成记录。
- 已确认 PDF 目前只是附件保存，不具备预览、裁剪、题目/答案分离和 OCR。
- 已确认编辑/删除/归档入口缺失，日历月份硬编码为 2026 年 8 月，发布和多端构建链路尚未闭合。
- 本次审查环境没有 `node` / `npm`，需在具备 Node.js 的环境补跑语法和启动验证。
## 2026-08-09 同步安全与完成记录合并

- `main.js` 为局域网同步接收器增加随机配对令牌，所有 GET/POST 请求要求 `x-shiti-token`。
- 桌面端通过 IPC 暴露令牌，指引页显示配对信息；同步配置增加令牌字段，前端请求自动带上令牌。
- 服务端合并 `done` 时按日期做集合并集，降低跨设备完成记录回退风险。
- README 和使用说明书已补充配对令牌使用说明。
## 2026-08-09 动态复习日历

- `app.js` 的复习日历改为读取当前系统年月和当月实际天数。
- 日历根据 `done[YYYY-MM-DD]` 标记当天是否有完成记录，并显示完成题数提示。
- 修复了原先固定显示 2026 年 8 月的问题。
## 2026-08-09 错题学习档案细化

- 错题模型新增/规范 `createdAt`，旧数据自动以原更新时间或当前时间补齐。
- 每张错题卡显示入库日期、累计复习次数、最近复习日期。
- 展开答案后显示完整的去重复习日期列表。
- 按科目、模块、单元、知识点、细标签计算分类层级数和标签总数，并显示在卡片元信息中。
- README 和使用说明书已同步更新。
## 2026-08-09 按需展示与中文操作标注

- 错题卡默认只展示科目、模块、标题、题干摘要和复习次数。
- 新增「查看学习档案 / 收起学习档案」按钮，按需展示入库日期、复习日期、分类层级、标签总数和完整标签路径。
- 答案仍由独立的「查看答案 / 收起答案」控制，学习档案与答案互不干扰。
- 复习反馈按钮改为完整中文动作和间隔说明。
- 搜索、视图切换、关闭弹窗等图标型按钮补充中文名称、`title` 和 `aria-label`。

### 2026-08-09 晚间 · 822 考研适配批次

- 默认科目配置新增「822控制」（7 大模块对齐 822 考研引擎：系统建模/时域/稳定性/根轨迹/频域/校正/状态空间）。
- 跨端同步合并逻辑已在 main.js 服务端实现（按 updatedAt 逐题合并），使用说明书已同步更新说明。
- 配套：822 考研引擎（考点/题型/结论卡）、考研执行看板（周任务）、822 导入模板（自习室）。
