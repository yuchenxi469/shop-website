// 核心纯函数自动化测试
// 运行：npm test（Node 内置 test runner + node:assert，零依赖、离线）
// 被测函数均来自 js/exam-utils.js —— 该文件无 DOM/localStorage 依赖，可安全在 Node 中 require
const { test } = require("node:test");
const assert = require("node:assert");

const {
  formatTime,
  calculateEndTime,
  validateAndFormatTime,
  buildCustomExamSections,
} = require("../js/exam-utils.js");

// 随题 fixture：科目一 90（计入）/ 休息 10（不计入）/ 科目二 30（计入），总计 120，09:00 开始
function buildFixture() {
  return {
    id: 1,
    name: "模拟测评-综合卷",
    startTime: "09:00",
    date: "2026-10-15",
    timeRange: "09:00 - 11:00",
    totalMinutes: 120,
    sections: [
      { name: "科目一", duration: 90, description: "科目一", countInTotal: true },
      { name: "休息", duration: 10, description: "休息", countInTotal: false },
      { name: "科目二", duration: 30, description: "科目二", countInTotal: true },
    ],
    displaySettings: { showCurrentTime: true, showCountdownTimer: true, showSectionTimer: true },
  };
}

// ============ buildCustomExamSections（T1 抽离的转换纯函数） ============
test("T1 回归：fixture 下每个环节的 start/end/realTime 与期望表一致", () => {
  const s = buildCustomExamSections(buildFixture());

  // 结果包含 3 个环节 + 1 个"考试结束"，且不计入环节仍可见
  assert.strictEqual(s.length, 4);

  assert.deepStrictEqual(
    { start: s[0].start, end: s[0].end, realTime: s[0].realTime },
    { start: 0, end: 90, realTime: "09:00-10:30" },
  );
  // 零时长占位：start === end，位置为之前计入环节之和（90）
  assert.deepStrictEqual(
    { start: s[1].start, end: s[1].end, realTime: s[1].realTime },
    { start: 90, end: 90, realTime: "10:30-10:30" },
  );
  assert.deepStrictEqual(
    { start: s[2].start, end: s[2].end, realTime: s[2].realTime },
    { start: 90, end: 120, realTime: "10:30-11:00" },
  );
});

test("T1 回归：'考试结束'环节位于 totalMinutes（120），realTime 为 11:00", () => {
  const s = buildCustomExamSections(buildFixture());
  const end = s[s.length - 1];
  assert.strictEqual(end.name, "考试结束");
  assert.strictEqual(end.start, 120);
  assert.strictEqual(end.end, 120);
  assert.strictEqual(end.realTime, "11:00");
});

test("T1 语义：不计入环节保留 countInTotal 并带 untimed 标记，原 duration 不被篡改", () => {
  const s = buildCustomExamSections(buildFixture());
  const rest = s[1];
  assert.strictEqual(rest.name, "休息");
  assert.strictEqual(rest.countInTotal, false);
  assert.strictEqual(rest.untimed, true);
  assert.strictEqual(rest.duration, 10); // 原始时长保留，仅环节链中零时长占位
  assert.strictEqual(s[0].untimed, false);
  assert.strictEqual(s[0].countInTotal, true);
});

test("T1 三方一致：末端等于 startTime + totalMinutes", () => {
  const exam = buildFixture();
  const s = buildCustomExamSections(exam);
  const lastSection = s[s.length - 2]; // 最后一个真实环节
  // 计入环节链末端应等于 totalMinutes，与标题区/总时间一致
  assert.strictEqual(lastSection.end, exam.totalMinutes);
  assert.strictEqual(
    calculateEndTime(exam.startTime, exam.totalMinutes),
    s[s.length - 1].realTime,
  );
});

// ============ formatTime ============
test("formatTime：0 → 00:00:00", () => {
  assert.strictEqual(formatTime(0), "00:00:00");
});

test("formatTime：7325 → 02:02:05", () => {
  assert.strictEqual(formatTime(7325), "02:02:05");
});

test("formatTime：负数与 NaN 钳为 00:00:00（本实现定义的防御行为）", () => {
  assert.strictEqual(formatTime(-10), "00:00:00");
  assert.strictEqual(formatTime(-3661), "00:00:00");
  assert.strictEqual(formatTime(NaN), "00:00:00");
});

// ============ calculateEndTime ============
test("calculateEndTime：同日、跨午夜、零时长", () => {
  assert.strictEqual(calculateEndTime("09:00", 120), "11:00");
  assert.strictEqual(calculateEndTime("23:30", 120), "01:30 (次日)");
  assert.strictEqual(calculateEndTime("00:00", 0), "00:00");
});

// ============ validateAndFormatTime ============
test("validateAndFormatTime：合法、可修复与非法输入", () => {
  assert.strictEqual(validateAndFormatTime("09:30"), "09:30");
  assert.strictEqual(validateAndFormatTime("9:30"), "09:30");
  assert.strictEqual(validateAndFormatTime("0930"), "09:30");
  assert.strictEqual(validateAndFormatTime("25:99"), null);
  assert.strictEqual(validateAndFormatTime("abc"), null);
  assert.strictEqual(validateAndFormatTime(""), null);
  assert.strictEqual(validateAndFormatTime(null), null);
  assert.strictEqual(validateAndFormatTime("24:00"), null);
});

// ============ 防御用例：全部环节不计入（totalMinutes=0） ============
test("防御：全部环节 countInTotal=false 时不抛错且总时长为 0", () => {
  const exam = {
    name: "全不计时",
    startTime: "09:00",
    totalMinutes: 0,
    sections: [
      { name: "a", duration: 10, countInTotal: false },
      { name: "b", duration: 20, countInTotal: false },
    ],
  };
  let s;
  assert.doesNotThrow(() => {
    s = buildCustomExamSections(exam);
  });
  // 环节可见（2 + 考试结束 = 3）
  assert.strictEqual(s.length, 3);
  // 每个环节 start === end === 0，末端也落在 0
  s.forEach((sec) => {
    assert.strictEqual(sec.start, 0);
    assert.strictEqual(sec.end, 0);
  });
  assert.strictEqual(s[s.length - 1].name, "考试结束");
  assert.strictEqual(s[s.length - 1].start, 0);
});
