# Exam Clock AI Coding 上机考核 · 题目文档

| 项 | 值 |
|---|---|
| 考核名称 | Exam Clock AI Coding 上机测试 |
| 编程阶段时长 | 90 分钟（第二部分倒计时归零即提交；第一部分问卷与第三部分简答另行计时） |
| 考核对象 | 前端实习生 |
| 考核基座 | [LUOLIN926/exam-clock](https://github.com/LUOLIN926/exam-clock)（考试倒计时模拟器，原生 HTML/CSS/JS） |
| 固定基线 | commit `21fc2141a49c2517416440ae28701586ae93fe9d`（所有人同一份代码） |
| AI 政策 | 允许使用自备 AI 编程工具、搜索引擎和官方文档；无需完整操作记录，但须在平台提交首条完整 Prompt。平台不提供 API Key；本文件评分仅针对第二部分编程交付，第三部分另行人工评阅 |
| 方向与难度 | 前端 · 标准；任务、时长和分值不变，不代表四套工作量完全相同 |
| 面试追问 | 考生须能逐行解释自己提交的每一处改动 |

## 一、考试说明

你将在 90 分钟内，在一个真实开源项目上完成 1 个缺陷修复、1 个功能实现和 1 组自动化测试。本项目是一个浏览器内的考试流程倒计时模拟器：选择官方预设（CET、高考）或自定义考试后，页面模拟考场时钟，展示总倒计时、当前环节、环节倒计时和考试时间线。

评分构成：T1 缺陷修复 40% + T2 功能实现 35% + T3 自动化测试 20% + 提交规范与代码卫生 5%。存在一票否决项（见第七节）。

## 二、环境与约束

### 环境准备（开考前完成）

```bash
git clone https://github.com/LUOLIN926/exam-clock.git
cd exam-clock
git checkout 21fc2141a49c2517416440ae28701586ae93fe9d
python3 -m http.server 8000
```

- 浏览器访问 <http://localhost:8000/>（主模拟器）、<http://localhost:8000/custom-exam.html>（自定义考试配置页）
- Node.js ≥ 18（T3 需要）；推荐 Chrome / Edge 最新版
- 编程过程中允许使用 AI 服务、搜索引擎与官方文档，并允许推送 GitHub。离线要求仅针对产品运行和自动化测试：运行与测试不能依赖外部服务；依赖应提前准备

### 允许 / 禁止

| 允许 | 禁止 |
|---|---|
| 使用任意 AI 编程工具与搜索引擎 | 修改 `officialExams`、`officialPresetCategories` 及任何官方预设数据来"让测试通过" |
| 阅读源码、官方文档（MDN） | 引入外部音频文件、CDN、npm 私有包等任何网络资源（T3 的测试框架除外） |
| 新增文件、重构（以不改变既有浏览器行为为前提） | 为通过测试而改变产品既有正确行为 |
| 编写测试（含引入测试框架） | 把断言散列进产品代码、遗留 `console.log` 调试输出 |

## 三、代码导览

### 文件职责

| 文件 | 职责 |
|---|---|
| `index.html` | 主模拟器页面：标题区、倒计时、环节下拉、时间线、预设选择器、显示设置 |
| `js/script.js` | 官方预设数据、计时器状态机、时间线渲染、显示设置持久化、自定义考试应用到首页 |
| `js/custom-exam.js` | 自定义考试编辑器：表单校验、环节增删/排序/拖拽、保存与应用 |
| `css/styles.css` | 全站样式 |
| `sw.js` / `manifest.json` | PWA 离线缓存与应用元数据 |

### 关键数据结构

自定义考试对象（存于 `localStorage.customExams` / `selectedCustomExam`）：

```js
{
  id, name, startTime: "HH:MM", date: "YYYY-MM-DD", timeRange,
  sections: [{ name, duration /* 分钟 */, description, countInTotal /* 是否计入总时间 */ }],
  totalMinutes /* 仅累加 countInTotal 为 true 的环节 */,
  displaySettings: { showCurrentTime, showCountdownTimer, showSectionTimer }
}
```

首页环节对象（`js/script.js` 内部使用，`start`/`end` 单位为**分钟**）：

```js
{ name, start, duration, end, description, realTime /* "HH:MM-HH:MM" */ }
```

localStorage 键：`customExams`（已保存配置列表）、`selectedCustomExam`（当前应用的自定义考试）、`displaySettings`（显示设置）。

### 关键函数位置（行号以固定基线为准）

| 位置 | 函数 | 说明 |
|---|---|---|
| `js/script.js:722` | `formatTime` | 秒 → `HH:MM:SS` |
| `js/script.js:729` | `getRealTime` | 根据考试开始时间推算考场实时时间 |
| `js/script.js:749` | `updateTimer` | 每秒滴答：剩余时间、进度条、当前环节查找 |
| `js/script.js:858` | `updateSectionList` | 时间线渲染与已完成环节统计 |
| `js/script.js:924 / 938 / 951` | `startExam` / `pauseExam` / `resetExam` | 开始 / 暂停 / 重置 |
| `js/script.js:1004 / 1015 / 1037` | `handleSectionChange` / `skipToSelectedSection` / `nextSection` | 环节跳转（三种入口） |
| `js/script.js:1093` | `updateExamConfig` | 切换官方预设 |
| `js/script.js:1303` | `applyCustomExamConfig` | **T1 主战场**：自定义考试 → 首页环节链 |
| `js/script.js:1407 / 1421` | `formatDate` / `calculateEndTime` | 日期与结束时间（含跨午夜） |
| `js/script.js:1440 / 1476 / 1504 / 1531 / 1555` | `initializeDisplaySettings` / `applyDisplaySettings` / `toggleDisplaySetting` / `resetDisplaySettings` / `updateDisplaySettings` | **T2 复刻点**：显示设置持久化全套 |
| `js/custom-exam.js:957` | `validateAndFormatTime` | 时间字符串校验与格式化 |
| `js/custom-exam.js:1004` | `saveCustomExam` | 保存配置（`countInTotal` 累加总时长在 1053 行） |
| `js/custom-exam.js:758` | `addSection` | 环节卡片模板（"计入总时间"复选框在 791 行） |
| `js/custom-exam.js:1489` | `applyCustomExam` | 应用表单配置并跳回首页 |
| `index.html:225-280` | — | 显示设置复选框区（T2 复刻点） |

## 四、T1 缺陷修复（40%，建议 25 分钟）

### 缺陷描述

自定义考试支持把某个环节标记为"不计入总时间"（`custom-exam.html` 每个环节行有该复选框）：保存时 `totalMinutes` 只累加计入环节（见 `saveCustomExam` @custom-exam.js:1053）。但 `applyCustomExamConfig`（script.js:1303）把自定义考试转换成首页环节链时**完全忽略了 `countInTotal`**，所有环节按真实 `duration` 依次拼接，造成三处用户可见故障。

### 复现步骤

1. 访问 <http://localhost:8000/custom-exam.html>，先清空本地数据：浏览器 Console 执行 `localStorage.clear()` 后刷新
2. 按随题 fixture 录入并点击"应用配置"：
   - 考试名称：`模拟测评-综合卷`；开始时间：`09:00`；考试日期：`2026-10-15`
   - 环节一：`科目一`，90 分钟，勾选"计入总时间"
   - 环节二：`休息`，10 分钟，**取消勾选**"计入总时间"
   - 环节三：`科目二`，30 分钟，勾选"计入总时间"
3. 观察首页（index.html）当前（未修复）表现：

| # | 现象 |
|---|---|
| 1 | 标题区考试时间段显示 `09:00 - 11:00`，但时间线中"科目二"的考场时间为 `10:40-11:10`、"考试结束"落在 `11:10`——末端互相矛盾（差 10 分钟，恰为不计入环节的时长） |
| 2 | 在"跳转到环节"下拉框选择"考试结束 (11:10)"，倒计时显示 `-1:-10:00`，"剩余分钟"显示 `-10` |
| 3 | "考试结束"位于第 130 分钟，已超出本场考试 120 分钟的总倒计时——它在本场考试中不可能被到达（对比：官方预设 CET-4 的"考试结束"恰好在 140 分钟总时长处） |

### 修复要求（预期行为，逐条可判定）

1. **零时长占位语义**：不计入总时间的环节在环节链中 `start === end`（零时长占位），位置等于其之前所有计入环节时长之和；计入环节依次拼接。fixture 修复后期望值：

   | 环节 | 计入总时间 | start(min) | end(min) | 考场时间 |
   |---|---|---|---|---|
   | 科目一 | 是 | 0 | 90 | 09:00-10:30 |
   | 休息 | 否 | 90 | 90 | 10:30-10:30 |
   | 科目二 | 是 | 90 | 120 | 10:30-11:00 |
   | 考试结束 | — | 120 | 120 | 11:00 |

2. 时间线中零时长环节**必须仍可见**：下拉框与 `#timeline` 中都保留该环节；时间线标题显示"不计时"而非"0min"（例：`休息（不计时）`），需要在转换后的环节对象上保留 `countInTotal` 语义并在 `updateSectionList` 渲染
3. "考试结束"环节 start=end=`totalMinutes`，即 `startTime + totalMinutes`（fixture 下为 11:00）
4. 倒计时从 `02:00:00` 递减到 `00:00:00`；归零时 `#currentSection` 显示"考试结束！"、`#progressFill` 宽度 100%
5. **钳制与防乱码**：任何跳转路径（下拉框、"下一环节"按钮、自然运行）后 `timeLeft ∈ [0, totalTime×60]`；越界请求钳到边界值，不得出现负数或 `-1:-10:00` 形式的输出。`formatTime` 增加防御性钳负为加分项，非必须
6. **三方一致**：标题区考试时间段、时间线末端、"总时间"统计三者一致（fixture：`09:00 - 11:00`、`11:00`、`120`）
7. **回归否决项**：官方预设（CET-4 / CET-6 / 9 个高考预设）的环节链、总时长、时间线与修复前完全一致
8. **工程约束**：必须把"自定义考试对象 → 环节数组"的转换逻辑抽离为**无 DOM 依赖的纯函数**（命名自定），供 T3 直接单测；只改一行 `if` 或按名称特判 fixture 均不得满分

### 范围外事项（本次不要求）

- 不改倒计时结束后的时间线状态表现（现状：结束后全部显示"待开始"，属既有设计）
- 不改造官方预设数据结构
- 不处理总时长为 0 时的产品语义（只要求不白屏、页面不出现 NaN，且无未捕获错误）

## 五、T2 功能实现（35%，建议 30 分钟）

### 需求：环节切换提醒

当前考试在环节切换时没有任何提醒，考生容易错过节奏。请实现"环节切换提示"，要求逐条可判定：

1. **提示音**：使用 Web Audio API（`OscillatorNode` + `GainNode` 包络即可）合成一段短音（建议 200-300ms，频率自定）；**禁止**引入外部音频文件或 CDN
2. **触发时机**（三种入口都要触发，每次切换仅响一次）：
   - 考试运行中倒计时自然跨入新环节（`updateTimer` 内检测当前环节变化）
   - 点击"下一环节"按钮（`nextSection`）
   - 在环节下拉框选择跳转（`handleSectionChange` / `skipToSelectedSection`）
3. **开关与持久化**（完整复用现有 displaySettings 模式，这是评分重点）：
   - 在首页"显示设置"区新增复选框"环节切换提示音"，**默认勾选**（复刻 `index.html:225-280` 现有三个复选框的写法）
   - `toggleDisplaySetting`（script.js:1504）增加对应 case；`applyDisplaySettings` / `resetDisplaySettings` / `initializeDisplaySettings` 中构造的设置对象与全局变量**同步扩展**（禁止只改一处导致恢复默认时丢失）
   - 持久化到 `localStorage.displaySettings`；刷新页面、切换预设、从 custom-exam.html 应用考试返回后，开关状态均保持
   - 关闭后：三种入口的切换均不发声、不显示视觉提示
4. **自动播放限制**：`AudioContext` 不得在用户交互前创建或播放；应在首次用户手势（如点击"开始考试"）中创建或 `resume()`。首次交互前无声是可接受的，但 Console **不得出现未捕获错误**
5. **视觉提示**：至少一项非听觉提示（如当前环节区域闪烁高亮 1-2 秒，或 2 秒自动消失的 toast）；视觉提示与提示音受**同一个开关**控制
6. **PWA 同步（条件项）**：若你新增了静态资源文件，必须把它加入 `sw.js` 的 `ASSETS` 并将 `CACHE_NAME` 由 `exam-clock-v3` 提升为 `exam-clock-v4`；使用 Web Audio 合成则无新增资源，此项记为"不适用"，不得因此扣分

## 六、T3 自动化测试（20%，建议 25 分钟）

本项目当前没有任何自动化测试。请为核心纯函数补齐测试：

1. **统一入口**：`npm test` 一条命令、离线、退出码为 0（在仓库根新建 `package.json` 并配置 `scripts.test`）
2. **框架**：推荐零依赖方案（Node ≥ 18 内置 `node --test` + `node:assert`）；允许 Vitest 等，但必须一条命令跑通且不访问网络
3. **必须覆盖的纯函数**：`formatTime`（script.js:722）、`calculateEndTime`（script.js:1421）、`validateAndFormatTime`（custom-exam.js:957）、以及你在 T1 中抽离的"自定义考试 → 环节链"转换函数
4. **最低用例集**（数值必须与实现一致地断言）：
   - T1 回归：fixture（90 / 不计 10 / 30）下每个环节的 `start`/`end`/`realTime`，且"考试结束"位置 = 120
   - `formatTime`：`0 → 00:00:00`；`7325 → 02:02:05`；负数输入行为由你定义（钳 0 或原样），测试按你的实现断言
   - `calculateEndTime`：`("09:00", 120) → 11:00`；`("23:30", 120) → 01:30 (次日)`；`("00:00", 0) → 00:00`
   - `validateAndFormatTime`：`"09:30" → 09:30`；`"9:30" → 09:30`；`"0930" → 09:30`；`"25:99" → null`；`"abc" → null`；`"" → null`；`null → null`；`"24:00" → null`
   - 防御用例：全部环节 `countInTotal: false`（totalMinutes=0）时转换函数不抛错且总时长为 0
5. **可测性改造手法白名单**（不得改变浏览器内行为，禁止把断言写进产品代码）：
   - 文件末尾加导出守卫：`if (typeof module !== "undefined" && module.exports) { module.exports = { ... }; }`
   - 或将纯函数抽到新文件，并在 `index.html` / `custom-exam.html` 用 `<script>` 引入（注意加载顺序，先引入后使用）
6. 测试文件位置自定（建议 `tests/`）；考官会执行 `npm test` 并核对输出中的断言

## 七、提交物与一票否决项

### 提交物（考试结束时）

| 项 | 要求 |
|---|---|
| 代码 | 基线之后的全部改动提交并推送到自己新建的 GitHub 公开仓库，在平台提交仓库根地址；本地提交、压缩包或 patch 仅作辅助材料，不能替代公开仓库 |
| 说明 | 200 字以内：每个任务的实现思路与关键决策（放在 `SUBMISSION.md` 仓库根目录） |
| 测试 | `npm test` 的终端输出（通过/失败数量） |

> 若使用 patch 方式提交：`git add -A -N && git diff 21fc2141a49c2517416440ae28701586ae93fe9d > submission.patch`。

### 一票否决项（触发即整卷不通过）

- 修改官方预设数据（`officialExams` / `officialPresetCategories` / 预设 sections）使用例"通过"
- `npm test` 退出码非 0，或测试依赖网络
- 遗留 `console.log` 调试输出（修复前已有的 `console.log` 除外，但不得新增）
- 为让测试通过而改变产品既有正确行为（可用官方预设回归验证）

## 八、时间分配与评分权重预览

| 阶段 | 时间 | 内容 |
|---|---|---|
| 0:00-0:25 | 25 min | T1 缺陷修复 |
| 0:25-0:55 | 30 min | T2 功能实现 |
| 0:55-1:20 | 25 min | T3 自动化测试 |
| 1:20-1:30 | 10 min | 缓冲、自测与提交 |

| 权重项 | 分值 | 说明 |
|---|---|---|
| T1 缺陷修复 | 40 | 转换正确性 12 / 零时长与"不计时"展示 6 / 钳制与防乱码 8 / 三方一致 6 / 纯函数抽离 5 / 官方预设回归 3 |
| T2 功能实现 | 35 | 提示音 10 / 触发时机完整 6 / 开关复用与持久化 10 / 自动播放无错误 4 / 视觉提示 3 / PWA 同步（条件项）2 |
| T3 自动化测试 | 20 | 一条命令 exit 0 得 5 / 覆盖矩阵 8 / 最低用例集数值 4 / 未改变浏览器行为 3 |
| 提交规范与代码卫生 | 5 | 提交物完整 2 / 无调试残留 2 / 风格一致 1 |

评分细则由考官依据《02-验收标准.md》逐条判定；测试操作步骤见《03-测试用例.md》（考官用，与考生无关）。

## 平台交付与计时说明

- 编程阶段结束前推送全部改动到 GitHub 公开仓库，并在平台提交仓库根地址与启动项目时向 AI 发出的第一条完整指令。首条 Prompt 只需填入平台，不要求公开到仓库。
- 将实现说明及测试输出放在仓库内，确保管理员可从公开提交复现；不得提交 API Key、Token 或个人敏感信息。
- 无需完整 AI 操作记录。第一部分问卷、第二部分编程和第三部分 5+3 简答分别按平台计时；第三部分准备期不占简答时间。
