# 提交说明（Exam Clock AI Coding 上机考核）

## 各任务实现思路与关键决策

**T1 缺陷修复**：把"自定义考试 → 首页环节链"的转换抽成无 DOM 依赖的纯函数 `buildCustomExamSections`（新文件 `js/exam-utils.js`）。核心决策：不计入总时间的环节生成零时长占位（`start===end`，位置为其之前所有计入环节之和），并带 `untimed` 标记供时间线/下拉框渲染"不计时"；"考试结束"固定落在 `totalMinutes`，使标题区、时间线、总时间三方一致。三个跳转入口统一经 `clampTimeLeft` 钳制 `timeLeft∈[0,total]`，杜绝负数乱码；`totalTime=0` 时跳过进度计算避免 NaN；`formatTime` 对负数/NaN 钳为 0（加分项）。官方预设数据与代码路径零改动。

**T2 环节切换提示**：Web Audio `OscillatorNode+GainNode` 合成约 250ms 短音，无外部音频。`AudioContext` 懒创建，仅在"开始考试"等用户手势中构造/`resume()`，`resume().catch`+`try/catch` 保证首次交互前无未捕获错误。三入口（`updateTimer` 自然跨环节、`nextSection`、下拉跳转）统一调用 `notifySectionChange(index)`，按环节索引去重实现"每切换仅响一次"。新增复选框"环节切换提示音"（默认勾选），完整复用 displaySettings 模式：全局变量与 `initialize/apply/toggle/reset/updateDisplaySettings` 五处同步扩展并持久化到 `localStorage`；`applyDisplaySettings` 对新字段"缺失则保留当前值"，兼容旧存档自定义考试，确保应用/刷新后开关状态保持。视觉闪烁高亮与提示音受同一开关控制。

**T3 自动化测试**：零依赖，`npm test` = `node --test tests/*.test.js`（Node ≥18 内置 runner，离线、退出码 0）。纯函数集中在无 DOM 的 `exam-utils.js` 并加导出守卫，测试直接 require，断言不侵入产品代码。覆盖 `formatTime`、`calculateEndTime`、`validateAndFormatTime`、`buildCustomExamSections` 及文档最低用例集与全不计入防御用例。

## PWA 同步

新增了静态文件 `js/exam-utils.js`，故已将其加入 `sw.js` 的 `ASSETS` 并将 `CACHE_NAME` 由 `exam-clock-v3` 提升为 `exam-clock-v4`。

## 测试结果（`npm test` 输出）

```
# tests 10
# suites 0
# pass 10
# fail 0
# cancelled 0
# skipped 0
```

退出码：0（离线运行，无网络依赖）。
