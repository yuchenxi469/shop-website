// ==========================================
// 与 DOM 无关的纯函数工具集
// 由 index.html / custom-exam.html 在其他业务脚本之前引入
// 在 Node 环境下（typeof document === "undefined"）不会执行任何 DOM 操作
// ==========================================

// 秒 → HH:MM:SS
// 防御性钳制（T1 第 5 条加分项）：负数与 NaN 一律钳为 0，避免倒计时出现乱码
function formatTime(seconds) {
  const safe = seconds >= 0 ? seconds : 0; // NaN >= 0 为 false，同时拦截 NaN
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// 计算结束时间（处理跨日期的情况）
function calculateEndTime(startTime, durationMinutes) {
  const [hours, minutes] = startTime.split(":").map(Number);
  const endTime = new Date(2000, 0, 1, hours, minutes);

  // 如果开始时间加上持续时间超过了24小时，则需要处理跨日期的情况
  endTime.setMinutes(endTime.getMinutes() + durationMinutes);

  const timeStr = `${endTime.getHours().toString().padStart(2, "0")}:${endTime.getMinutes().toString().padStart(2, "0")}`;
  const isNextDay = endTime.getDate() > 1 || endTime.getHours() < hours;
  return isNextDay ? `${timeStr} (次日)` : timeStr;
}

// 验证和格式化时间
function validateAndFormatTime(timeString) {
  if (!timeString || !timeString.trim()) {
    return null;
  }

  const timePattern = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
  if (timePattern.test(timeString)) {
    // 格式化时间（确保小时和分钟都是两位数）
    const [hours, minutes] = timeString.split(":");
    return `${parseInt(hours).toString().padStart(2, "0")}:${parseInt(minutes).toString().padStart(2, "0")}`;
  }

  // 尝试修复格式
  const numbers = timeString.replace(/[^\d]/g, "");
  if (numbers.length >= 2) {
    const hours = parseInt(numbers.substring(0, 2));
    const minutes = numbers.length >= 4 ? parseInt(numbers.substring(2, 4)) : 0;

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }
  }

  return null;
}

// 根据考试开始时间和偏移分钟数生成 "HH:MM" 考场时间
// 与原 applyCustomExamConfig 中基于 Date.setMinutes 的换算行为一致（跨午夜按 24 小时取模）
function toClockTime(startHours, startMinutes, offsetMinutes) {
  const d = new Date(2000, 0, 1, startHours, startMinutes);
  d.setMinutes(d.getMinutes() + offsetMinutes);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

// 自定义考试对象 → 首页环节链（纯函数，无 DOM 依赖）
// 规则：
// 1. countInTotal 为 false 的环节生成零时长占位（start === end），位置为其之前所有计入环节时长之和
// 2. 计入环节依次拼接
// 3. "考试结束"环节 start = end = totalMinutes（以输入 totalMinutes 为准）
// 4. 不计入环节带 untimed: true 标记，供时间线渲染"不计时"文案（不改动环节原始 duration）
function buildCustomExamSections(customExam) {
  const sections = (customExam && customExam.sections) || [];
  const [startHours, startMinutes] = String(customExam.startTime)
    .split(":")
    .map(Number);
  const totalMinutes = Number(customExam.totalMinutes) || 0;

  const customSections = [];
  let accumulated = 0;

  sections.forEach((section) => {
    const countsInTotal = section.countInTotal !== false;
    const duration = Number(section.duration) || 0;
    const start = accumulated;
    const end = countsInTotal ? start + duration : start;

    if (countsInTotal) {
      accumulated = end;
    }

    customSections.push({
      name: section.name,
      start: start,
      duration: duration,
      end: end,
      description: section.description,
      countInTotal: countsInTotal,
      untimed: !countsInTotal,
      realTime: `${toClockTime(startHours, startMinutes, start)}-${toClockTime(startHours, startMinutes, end)}`,
    });
  });

  // 添加考试结束环节：位置固定为 totalMinutes，与环节链拼接结果无关
  customSections.push({
    name: "考试结束",
    start: totalMinutes,
    duration: 0,
    end: totalMinutes,
    description: "考试结束",
    countInTotal: false,
    realTime: toClockTime(startHours, startMinutes, totalMinutes),
  });

  return customSections;
}

// Node 测试环境导出（浏览器下 module 未定义，不产生任何影响）
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    formatTime,
    calculateEndTime,
    validateAndFormatTime,
    buildCustomExamSections,
  };
}
