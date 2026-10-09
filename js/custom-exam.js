// 全局变量
let customExams = [
  {
    id: 1,
    name: "参考预设：中期模拟考试",
    startTime: "09:00",
    date: "2026-06-20",
    timeRange: "09:00 - 11:30",
    totalMinutes: 150,
    displaySettings: {
      showCurrentTime: false,
      showCountdownTimer: true,
      showSectionTimer: true,
    },
    sections: [
      {
        name: "考前准备",
        duration: 10,
        description: "发卷及填写信息",
        countInTotal: true,
      },
      {
        name: "第一部分",
        duration: 60,
        description: "选择题模块",
        countInTotal: true,
      },
      {
        name: "第二部分",
        duration: 80,
        description: "主观题模块",
        countInTotal: true,
      },
    ],
  },
];
let editingExamId = null; // 用于跟踪正在编辑的考试ID
let activeDropdown = null; // 当前打开的下拉框
let activePanel = null; // 当前打开的"下拉面板"（时间/日期整组）
let activePanelToggleBtn = null;

function openPanel(panelEl, toggleBtn) {
  if (activePanel && activePanel !== panelEl) {
    closePanel();
  }
  panelEl.classList.add("show-panel");
  if (toggleBtn) {
    toggleBtn.classList.add("active");
    // 为按钮中的图标添加旋转类
    const icon = toggleBtn.querySelector(".iconfont");
    if (icon) {
      icon.classList.add("icon-rotated");
    }
  }
  activePanel = panelEl;
  activePanelToggleBtn = toggleBtn || null;
}

function closePanel() {
  if (!activePanel) return;
  activePanel.classList.remove("show-panel");
  if (activePanelToggleBtn) {
    activePanelToggleBtn.classList.remove("active");
    // 为按钮中的图标移除旋转类
    const icon = activePanelToggleBtn.querySelector(".iconfont");
    if (icon) {
      icon.classList.remove("icon-rotated");
    }
  }
  activePanel = null;
  activePanelToggleBtn = null;
  closeDropdown();
}

function togglePanel(panelEl, toggleBtn) {
  if (!panelEl) return;
  const isOpen = panelEl.classList.contains("show-panel");
  if (isOpen) {
    closePanel();
  } else {
    openPanel(panelEl, toggleBtn);
  }
}

// 切换下拉框显示
function toggleDropdown(dropdown, trigger) {
  // 记录之前的活动下拉框
  const prevActiveDropdown = activeDropdown;

  // 关闭其他下拉框
  if (activeDropdown && activeDropdown !== dropdown) {
    activeDropdown.classList.remove("show");
    const otherTrigger = activeDropdown.previousElementSibling;
    if (
      otherTrigger &&
      otherTrigger.classList.contains("time-select-trigger")
    ) {
      otherTrigger.classList.remove("active");
      // 移除旋转类
      const arrowIcon = otherTrigger.querySelector(
        ".time-arrow .iconfont, .date-arrow .iconfont",
      );
      if (arrowIcon) arrowIcon.classList.remove("icon-rotated");
    } else if (
      otherTrigger &&
      otherTrigger.classList.contains("date-select-trigger")
    ) {
      otherTrigger.classList.remove("active");
      // 移除旋转类
      const arrowIcon = otherTrigger.querySelector(
        ".time-arrow .iconfont, .date-arrow .iconfont",
      );
      if (arrowIcon) arrowIcon.classList.remove("icon-rotated");
    }
  }

  // 如果之前打开的下拉框属于某个面板，且面板内已没有打开的下拉框，则收起面板
  const prevPanel =
    prevActiveDropdown &&
    prevActiveDropdown.closest(".time-dropdowns, .date-dropdowns");
  if (
    prevPanel &&
    !prevPanel.querySelector(
      ".time-select-dropdown.show, .date-select-dropdown.show",
    )
  ) {
    prevPanel.classList.remove("show-panel");
  }

  // 切换当前下拉框
  dropdown.classList.toggle("show");
  trigger.classList.toggle("active");

  // 查找当前触发器中的箭头图标并切换旋转类
  const arrowIcon = trigger.querySelector(
    ".time-arrow .iconfont, .date-arrow .iconfont",
  );
  if (arrowIcon) {
    arrowIcon.classList.toggle(
      "icon-rotated",
      dropdown.classList.contains("show"),
    );
  }

  if (dropdown.classList.contains("show")) {
    // 展开时，滚动到当前选中项，提升可用性
    const optionsContainer = dropdown.querySelector(
      ".time-select-options, .date-select-options",
    );
    const selectedOption = optionsContainer
      ? optionsContainer.querySelector(".selected")
      : null;
    if (selectedOption) {
      selectedOption.scrollIntoView({ block: "center" });
    }
    activeDropdown = dropdown;
    // 打开下拉时确保其所在面板可见（CSS 默认 display:none）
    const panel = dropdown.closest(".time-dropdowns, .date-dropdowns");
    if (panel) panel.classList.add("show-panel");
  } else {
    activeDropdown = null;
    // 关闭后若面板内没有任何打开的下拉框，则收起面板
    const panel = dropdown.closest(".time-dropdowns, .date-dropdowns");
    if (
      panel &&
      !panel.querySelector(
        ".time-select-dropdown.show, .date-select-dropdown.show",
      )
    ) {
      panel.classList.remove("show-panel");
    }
  }
}

// 关闭下拉框
function closeDropdown() {
  if (activeDropdown) {
    activeDropdown.classList.remove("show");
    const trigger = activeDropdown.previousElementSibling;
    if (
      trigger &&
      (trigger.classList.contains("time-select-trigger") ||
        trigger.classList.contains("date-select-trigger"))
    ) {
      trigger.classList.remove("active");
      // 移除旋转类
      const arrowIcon = trigger.querySelector(
        ".time-arrow .iconfont, .date-arrow .iconfont",
      );
      if (arrowIcon) arrowIcon.classList.remove("icon-rotated");
    }

    // 检查是否还有其他下拉框打开，如果没有则隐藏外层面板
    const panel = activeDropdown.closest(".time-dropdowns, .date-dropdowns");
    if (
      panel &&
      !panel.querySelector(
        ".time-select-dropdown.show, .date-select-dropdown.show",
      )
    ) {
      panel.classList.remove("show-panel");
      // 如果面板隐藏，也要确保按钮状态正确
      const toggleBtn = panel.parentElement.querySelector(".picker-toggle-btn");
      if (toggleBtn) {
        toggleBtn.classList.remove("active");
      }
    }
    activeDropdown = null;
  }
}

// 点击外部关闭下拉框
document.addEventListener("click", function (e) {
  if (activeDropdown && !activeDropdown.contains(e.target)) {
    const trigger = activeDropdown.previousElementSibling;
    if (!trigger || !trigger.contains(e.target)) {
      closeDropdown();
    }
  }
  // 点击空白处也收起"整组面板"
  if (activePanel && !activePanel.contains(e.target)) {
    if (!activePanelToggleBtn || !activePanelToggleBtn.contains(e.target)) {
      closePanel();
    }
  }
});

// 初始化自定义时间选择器
function initializeTimePicker() {
  const timeInput = document.getElementById("customExamStartTime");
  const hourTrigger = document.querySelector(
    '.time-select-trigger[data-part="hour"]',
  );
  const minuteTrigger = document.querySelector(
    '.time-select-trigger[data-part="minute"]',
  );
  const hourDropdown = document.querySelector(
    '.time-select-dropdown[data-part="hour"]',
  );
  const minuteDropdown = document.querySelector(
    '.time-select-dropdown[data-part="minute"]',
  );
  const hourOptions = hourDropdown.querySelector(".time-select-options");
  const minuteOptions = minuteDropdown.querySelector(".time-select-options");

  // 初始化小时选项（00-23）
  for (let i = 0; i <= 23; i++) {
    const option = document.createElement("div");
    option.className = "time-option";
    option.textContent = i.toString().padStart(2, "0");
    option.dataset.value = i.toString().padStart(2, "0");
    hourOptions.appendChild(option);
  }

  // 初始化分钟选项（00-59，每5分钟一个选项）
  for (let i = 0; i <= 59; i++) {
    const option = document.createElement("div");
    option.className = "time-option";
    option.textContent = i.toString().padStart(2, "0");
    option.dataset.value = i.toString().padStart(2, "0");
    minuteOptions.appendChild(option);
  }

  // 从输入框读取初始值
  const initialValue = timeInput.value || "12:00";
  const [initialHour, initialMinute] = initialValue.split(":");
  updateTimeDisplay(initialHour || "12", initialMinute || "00");

  // 小时下拉框点击事件
  hourTrigger.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleDropdown(hourDropdown, hourTrigger);
  });

  // 分钟下拉框点击事件
  minuteTrigger.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleDropdown(minuteDropdown, minuteTrigger);
  });

  // 小时选项点击事件
  hourOptions.querySelectorAll(".time-option").forEach((option) => {
    option.addEventListener("click", function (e) {
      e.stopPropagation();
      const value = this.dataset.value;
      updateTimeValue("hour", value);
      closeDropdown();
    });
  });

  // 分钟选项点击事件
  minuteOptions.querySelectorAll(".time-option").forEach((option) => {
    option.addEventListener("click", function (e) {
      e.stopPropagation();
      const value = this.dataset.value;
      updateTimeValue("minute", value);
      closeDropdown();
    });
  });

  // 时间输入框支持键盘输入
  timeInput.addEventListener("click", function () {
    this.removeAttribute("readonly");
    this.focus();
    this.select();
  });

  timeInput.addEventListener("input", function (e) {
    let value = e.target.value.replace(/[^\d]/g, "");

    // 自动添加冒号
    if (value.length >= 2) {
      value = value.substring(0, 2) + ":" + value.substring(2, 4);
    }

    // 限制长度为5（HH:MM）
    if (value.length > 5) {
      value = value.substring(0, 5);
    }

    e.target.value = value;
  });

  timeInput.addEventListener("blur", function (e) {
    let value = e.target.value.trim();

    // 如果为空，设置为默认值
    if (!value) {
      value = "12:00";
    }

    // 验证时间格式
    const timePattern = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timePattern.test(value)) {
      // 尝试修复格式
      const numbers = value.replace(/[^\d]/g, "");
      if (numbers.length >= 2) {
        const hours = Math.min(
          23,
          Math.max(0, parseInt(numbers.substring(0, 2))),
        );
        const minutes =
          numbers.length >= 4
            ? Math.min(59, Math.max(0, parseInt(numbers.substring(2, 4))))
            : 0;
        value = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
      } else {
        value = "12:00";
      }
    } else {
      // 格式化时间（确保小时和分钟都是两位数）
      const [hours, minutes] = value.split(":");
      value = `${parseInt(hours).toString().padStart(2, "0")}:${parseInt(minutes).toString().padStart(2, "0")}`;
    }

    e.target.value = value;
    const [hour, minute] = value.split(":");
    updateTimeDisplay(hour, minute);
    this.setAttribute("readonly", "readonly");
  });

  // 更新时间显示和值
  function updateTimeDisplay(hour, minute) {
    hourTrigger.querySelector(".time-value").textContent = hour.padStart(
      2,
      "0",
    );
    minuteTrigger.querySelector(".time-value").textContent = minute.padStart(
      2,
      "0",
    );
    timeInput.value = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;

    // 更新选中状态
    hourOptions.querySelectorAll(".time-option").forEach((opt) => {
      opt.classList.toggle(
        "selected",
        opt.dataset.value === hour.padStart(2, "0"),
      );
    });
    minuteOptions.querySelectorAll(".time-option").forEach((opt) => {
      opt.classList.toggle(
        "selected",
        opt.dataset.value === minute.padStart(2, "0"),
      );
    });
  }

  function updateTimeValue(part, value) {
    const currentValue = timeInput.value || "12:00";
    const [hour, minute] = currentValue.split(":");

    if (part === "hour") {
      updateTimeDisplay(value, minute || "00");
    } else {
      updateTimeDisplay(hour || "12", value);
    }
  }

  // 初始设置readonly
  timeInput.setAttribute("readonly", "readonly");
}

// 初始化自定义日期选择器
function initializeDatePicker() {
  const dateInput = document.getElementById("customExamDate");
  const yearTrigger = document.querySelector(
    '.date-select-trigger[data-part="year"]',
  );
  const monthTrigger = document.querySelector(
    '.date-select-trigger[data-part="month"]',
  );
  const dayTrigger = document.querySelector(
    '.date-select-trigger[data-part="day"]',
  );
  const yearDropdown = document.querySelector(
    '.date-select-dropdown[data-part="year"]',
  );
  const monthDropdown = document.querySelector(
    '.date-select-dropdown[data-part="month"]',
  );
  const dayDropdown = document.querySelector(
    '.date-select-dropdown[data-part="day"]',
  );
  const yearOptions = yearDropdown.querySelector(".date-select-options");
  const monthOptions = monthDropdown.querySelector(".date-select-options");
  const dayOptions = dayDropdown.querySelector(".date-select-options");

  const today = new Date();
  const currentYear = today.getFullYear();

  // 初始化年份选项（当前年份前后各10年）
  for (let i = currentYear - 10; i <= currentYear + 10; i++) {
    const option = document.createElement("div");
    option.className = "date-option";
    option.textContent = i;
    option.dataset.value = i;
    yearOptions.appendChild(option);
  }

  // 初始化月份选项（01-12）
  for (let i = 1; i <= 12; i++) {
    const option = document.createElement("div");
    option.className = "date-option";
    option.textContent = i.toString().padStart(2, "0");
    option.dataset.value = i.toString().padStart(2, "0");
    monthOptions.appendChild(option);
  }

  // 初始化日期（会在月份或年份改变时更新）
  function updateDayOptions(year, month) {
    dayOptions.innerHTML = "";
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      const option = document.createElement("div");
      option.className = "date-option";
      option.textContent = i.toString().padStart(2, "0");
      option.dataset.value = i.toString().padStart(2, "0");
      dayOptions.appendChild(option);
    }
    // 重新绑定事件
    dayOptions.querySelectorAll(".date-option").forEach((option) => {
      option.addEventListener("click", function (e) {
        e.stopPropagation();
        const value = this.dataset.value;
        updateDateValue("day", value);
        closeDropdown();
      });
    });
  }

  // 从输入框读取初始值或使用今天
  let initialDate = dateInput.value || today.toISOString().split("T")[0];
  const [initialYear, initialMonth, initialDay] = initialDate.split("-");
  updateDateDisplay(
    initialYear || currentYear.toString(),
    initialMonth || (today.getMonth() + 1).toString(),
    initialDay || today.getDate().toString(),
  );
  updateDayOptions(
    parseInt(initialYear || currentYear),
    parseInt(initialMonth || today.getMonth() + 1),
  );

  // 年份下拉框点击事件
  yearTrigger.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleDropdown(yearDropdown, yearTrigger);
  });

  // 月份下拉框点击事件
  monthTrigger.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleDropdown(monthDropdown, monthTrigger);
  });

  // 日期下拉框点击事件
  dayTrigger.addEventListener("click", function (e) {
    e.stopPropagation();
    const currentDate = dateInput.value || today.toISOString().split("T")[0];
    const [year, month] = currentDate.split("-");
    updateDayOptions(parseInt(year), parseInt(month));
    toggleDropdown(dayDropdown, dayTrigger);
  });

  // 年份选项点击事件
  yearOptions.querySelectorAll(".date-option").forEach((option) => {
    option.addEventListener("click", function (e) {
      e.stopPropagation();
      const value = this.dataset.value;
      updateDateValue("year", value);
      closeDropdown();
    });
  });

  // 月份选项点击事件
  monthOptions.querySelectorAll(".date-option").forEach((option) => {
    option.addEventListener("click", function (e) {
      e.stopPropagation();
      const value = this.dataset.value;
      updateDateValue("month", value);
      closeDropdown();
    });
  });

  // 日期选项点击事件（已在updateDayOptions中绑定）

  // 日期输入框支持键盘输入
  dateInput.addEventListener("click", function () {
    this.removeAttribute("readonly");
    this.focus();
    this.select();
  });

  dateInput.addEventListener("blur", function (e) {
    let value = e.target.value.trim();

    // 如果为空，设置为今天
    if (!value) {
      value = today.toISOString().split("T")[0];
    }

    // 验证日期格式 YYYY-MM-DD
    const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
    if (datePattern.test(value)) {
      const [year, month, day] = value.split("-");
      const date = new Date(year, month - 1, day);
      if (
        date.getFullYear() == year &&
        date.getMonth() == month - 1 &&
        date.getDate() == day
      ) {
        updateDateDisplay(year, month, day);
        updateDayOptions(parseInt(year), parseInt(month));
      } else {
        value = today.toISOString().split("T")[0];
        const [y, m, d] = value.split("-");
        updateDateDisplay(y, m, d);
      }
    } else {
      // 尝试修复格式
      const numbers = value.replace(/[^\d]/g, "");
      if (numbers.length >= 8) {
        const year = numbers.substring(0, 4);
        const month = Math.min(
          12,
          Math.max(1, parseInt(numbers.substring(4, 6))),
        );
        const day = Math.min(
          31,
          Math.max(1, parseInt(numbers.substring(6, 8))),
        );
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() == year && date.getMonth() == month - 1) {
          const maxDay = new Date(year, month, 0).getDate();
          const finalDay = Math.min(maxDay, day);
          value = `${year}-${month.toString().padStart(2, "0")}-${finalDay.toString().padStart(2, "0")}`;
          updateDateDisplay(year, month.toString(), finalDay.toString());
          updateDayOptions(parseInt(year), month);
        } else {
          value = today.toISOString().split("T")[0];
          const [y, m, d] = value.split("-");
          updateDateDisplay(y, m, d);
        }
      } else {
        value = today.toISOString().split("T")[0];
        const [y, m, d] = value.split("-");
        updateDateDisplay(y, m, d);
      }
    }

    e.target.value = value;
    this.setAttribute("readonly", "readonly");
  });

  // 更新日期显示和值
  function updateDateDisplay(year, month, day) {
    yearTrigger.querySelector(".date-value").textContent = year;
    monthTrigger.querySelector(".date-value").textContent = month.padStart(
      2,
      "0",
    );
    dayTrigger.querySelector(".date-value").textContent = day.padStart(2, "0");
    dateInput.value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

    // 更新选中状态
    yearOptions.querySelectorAll(".date-option").forEach((opt) => {
      opt.classList.toggle("selected", opt.dataset.value == year);
    });
    monthOptions.querySelectorAll(".date-option").forEach((opt) => {
      opt.classList.toggle(
        "selected",
        opt.dataset.value === month.padStart(2, "0"),
      );
    });

    // 更新日期选项的选中状态
    dayOptions.querySelectorAll(".date-option").forEach((opt) => {
      opt.classList.toggle(
        "selected",
        opt.dataset.value === day.padStart(2, "0"),
      );
    });
  }

  function updateDateValue(part, value) {
    const currentDate = dateInput.value || today.toISOString().split("T")[0];
    let [year, month, day] = currentDate.split("-");

    if (part === "year") {
      year = value;
      updateDayOptions(parseInt(year), parseInt(month));
      const daysInMonth = new Date(
        parseInt(year),
        parseInt(month),
        0,
      ).getDate();
      if (parseInt(day) > daysInMonth) {
        day = daysInMonth.toString();
      }
    } else if (part === "month") {
      month = value;
      updateDayOptions(parseInt(year), parseInt(month));
      const daysInMonth = new Date(
        parseInt(year),
        parseInt(month),
        0,
      ).getDate();
      if (parseInt(day) > daysInMonth) {
        day = daysInMonth.toString();
      }
    } else {
      day = value;
    }

    updateDateDisplay(year, month, day);
  }

  // 初始设置readonly
  dateInput.setAttribute("readonly", "readonly");
}

// DOM加载完成后初始化
document.addEventListener("DOMContentLoaded", function () {
  // 日期会在initializeDatePicker中初始化

  // 添加第一个默认环节
  addSection();

  // 添加默认的"考试结束"环节（不可删除）
  addEndSection();

  // 绑定事件监听器
  document
    .getElementById("addSectionBtn")
    .addEventListener("click", function () {
      addSection();
    });
  document
    .getElementById("saveCustomExamBtn")
    .addEventListener("click", saveCustomExam);
  document
    .getElementById("applyCustomExamBtn")
    .addEventListener("click", applyCustomExam);
  document
    .getElementById("backToMainBtn")
    .addEventListener("click", function () {
      window.location.href = "index.html";
    });

  // 加载已保存的配置
  loadSavedExams();

  // 初始化显示设置
  initializeDisplaySettings();

  // 初始化自定义时间选择器
  initializeTimePicker();

  // 初始化自定义日期选择器
  initializeDatePicker();

  // 为外部触发按钮添加事件监听器
  const pickerToggleButtons = document.querySelectorAll(".picker-toggle-btn");

  pickerToggleButtons.forEach(function (button) {
    button.addEventListener("click", function (e) {
      e.stopPropagation();

      // 获取目标类型（date或time）
      const target = this.getAttribute("data-target");

      if (target === "time") {
        // 只展开/收起面板，默认不自动打开第一个下拉
        const panel = document.querySelector(
          ".custom-time-picker .time-dropdowns",
        );
        if (panel) {
          const willShow = !panel.classList.contains("show-panel");
          panel.classList.toggle("show-panel", willShow);
          this.classList.toggle("active", willShow);
          // 若收起，则关闭任何已打开的下拉
          if (!willShow) closeDropdown();
        }
      } else if (target === "date") {
        // 只展开/收起面板，默认不自动打开第一个下拉
        const panel = document.querySelector(
          ".custom-date-picker .date-dropdowns",
        );
        if (panel) {
          const willShow = !panel.classList.contains("show-panel");
          panel.classList.toggle("show-panel", willShow);
          this.classList.toggle("active", willShow);
          if (!willShow) closeDropdown();
        }
      }
    });
  });
});

// 初始化显示设置
function initializeDisplaySettings() {
  // 默认所有选项都是选中状态
  const currentTimeCheckbox = document.getElementById("customShowCurrentTime");
  const countdownTimerCheckbox = document.getElementById(
    "customShowCountdownTimer",
  );
  const sectionTimerCheckbox = document.getElementById(
    "customShowSectionTimer",
  );

  if (currentTimeCheckbox) currentTimeCheckbox.checked = false;
  if (countdownTimerCheckbox) countdownTimerCheckbox.checked = true;
  if (sectionTimerCheckbox) sectionTimerCheckbox.checked = true;
}

// 添加考试环节
function addSection(
  name = "",
  duration = 30,
  description = "",
  countInTotal = true,
  isEndSection = false,
) {
  const container = document.getElementById("sectionsContainer");

  const sectionRow = document.createElement("div");
  sectionRow.className = "section-card";
  sectionRow.draggable = !isEndSection; // 只有非结束环节可以拖拽
  if (isEndSection) {
    sectionRow.classList.add("end-section-card");
    sectionRow.setAttribute("data-end-section", "true");
  }
  const index = container.children.length;
  sectionRow.innerHTML = `
    <div class="section-card-content">
      <div class="section-card-drag-handle" ${isEndSection ? 'style="opacity: 0.3; cursor: not-allowed;"' : ""}>
        <span class="drag-icon">☰</span>
      </div>
      <div class="section-field">
        <input type="text" class="section-name" placeholder="环节名称" value="${name}" required ${isEndSection ? "readonly" : ""}>
      </div>
      <div class="section-field">
        <input type="number" class="section-duration" placeholder="时长" min="1" value="${duration}" required ${isEndSection ? "readonly" : ""}>
      </div>
      <div class="section-field section-field-description">
        <input type="text" class="section-description" placeholder="环节描述（可选）" value="${description}" ${isEndSection ? "readonly" : ""}>
      </div>
      <div class="section-field section-field-checkbox">
        <label class="count-in-total-label">
          <input type="checkbox" class="count-in-total-checkbox" ${countInTotal ? "checked" : ""} ${isEndSection ? "disabled" : ""} title="计入总时间">
          <span class="checkbox-text-mobile">计入总时间</span>
        </label>
      </div>
      <div class="section-card-actions">
        ${
          isEndSection
            ? ""
            : `
          <button type="button" class="move-up-btn" title="上移">↑</button>
          <button type="button" class="move-down-btn" title="下移">↓</button>
          <button type="button" class="remove-section-btn" title="删除环节">✕</button>
        `
        }
      </div>
    </div>
  `;

  // 查找"考试结束"环节
  const endSection = Array.from(container.children).find((child) =>
    child.hasAttribute("data-end-section"),
  );

  if (endSection && !isEndSection) {
    // 如果存在"考试结束"环节且当前添加的不是结束环节，则插入到"考试结束"环节之前
    container.insertBefore(sectionRow, endSection);
  } else {
    // 否则直接添加到容器末尾
    container.appendChild(sectionRow);
  }

  // 绑定事件
  if (!isEndSection) {
    sectionRow
      .querySelector(".remove-section-btn")
      .addEventListener("click", function () {
        removeSection(this);
      });
    sectionRow
      .querySelector(".move-up-btn")
      .addEventListener("click", function () {
        moveSectionUp(this);
      });
    sectionRow
      .querySelector(".move-down-btn")
      .addEventListener("click", function () {
        moveSectionDown(this);
      });

    // 拖拽功能
    sectionRow.addEventListener("dragstart", handleDragStart);
    sectionRow.addEventListener("dragover", handleDragOver);
    sectionRow.addEventListener("drop", handleDrop);
    sectionRow.addEventListener("dragend", handleDragEnd);
  }
}

// 移动环节上移
function moveSectionUp(button) {
  const card = button.closest(".section-card");
  const previous = card.previousElementSibling;
  if (previous) {
    // 插入到前一个元素之前
    card.parentNode.insertBefore(card, previous);
  }
}

// 移动环节下移
function moveSectionDown(button) {
  const card = button.closest(".section-card");
  const next = card.nextElementSibling;
  if (next) {
    // 确保不把卡片移到"考试结束"卡片的下方
    if (next.hasAttribute("data-end-section")) {
      return;
    }
    // 插入到下下一个元素之前，或者直接在next之后
    card.parentNode.insertBefore(card, next.nextSibling);
  }
}

// 添加默认的"考试结束"环节
function addEndSection() {
  addSection("考试结束", 0, "收答题卡和试题册", false, true);
}

// 拖拽功能
let draggedElement = null;

function handleDragStart(e) {
  draggedElement = this;
  this.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/html", this.innerHTML);
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }

  // 不能拖到"考试结束"环节之后
  if (this.classList.contains("end-section-card")) {
    return false;
  }

  // 不能从"考试结束"环节拖出
  if (draggedElement && draggedElement.classList.contains("end-section-card")) {
    return false;
  }

  e.dataTransfer.dropEffect = "move";

  const afterElement = getDragAfterElement(this.parentNode, e.clientY);
  if (afterElement == null) {
    // 检查是否是最后一个非结束环节
    const cards = Array.from(this.parentNode.children);
    const lastRegularCard = cards[cards.length - 2]; // 倒数第二个（最后一个应该是结束环节）
    if (lastRegularCard && lastRegularCard !== draggedElement) {
      this.parentNode.insertBefore(draggedElement, lastRegularCard.nextSibling);
    }
  } else {
    // 确保不插入到"考试结束"环节之后
    if (!afterElement.classList.contains("end-section-card")) {
      this.parentNode.insertBefore(draggedElement, afterElement);
    }
  }

  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  return false;
}

function handleDragEnd(e) {
  this.classList.remove("dragging");
  draggedElement = null;
}

function getDragAfterElement(container, y) {
  const draggableElements = [
    ...container.querySelectorAll(
      ".section-card:not(.dragging):not(.end-section-card)",
    ),
  ];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: Number.NEGATIVE_INFINITY },
  ).element;
}

// 删除考试环节
function removeSection(button) {
  const sectionCard = button.closest(".section-card");
  // 不能删除"考试结束"环节
  if (sectionCard.classList.contains("end-section-card")) {
    return;
  }
  // 至少保留一个普通环节和"考试结束"环节
  const regularCards = document.querySelectorAll(
    ".section-card:not(.end-section-card)",
  );
  if (regularCards.length > 1) {
    if (confirm("确定要删除这个环节吗？")) {
      sectionCard.remove();
    }
  } else {
    alert("至少需要保留一个环节");
  }
}

// 保存自定义考试配置
function saveCustomExam() {
  const examName = document.getElementById("customExamName").value;
  let examStartTime = document.getElementById("customExamStartTime").value;
  const examDate = document.getElementById("customExamDate").value;

  if (!examName) {
    alert("请输入考试名称");
    return;
  }

  // 验证和格式化时间
  const formattedTime = validateAndFormatTime(examStartTime);
  if (!formattedTime) {
    alert("请输入有效的时间格式（HH:MM），例如：09:30");
    document.getElementById("customExamStartTime").focus();
    return;
  }
  examStartTime = formattedTime;
  document.getElementById("customExamStartTime").value = formattedTime;

  const sections = [];
  const sectionRows = document.querySelectorAll(".section-card");
  let totalMinutes = 0;

  for (let i = 0; i < sectionRows.length; i++) {
    const row = sectionRows[i];
    const name = row.querySelector(".section-name").value;
    const duration = parseInt(row.querySelector(".section-duration").value);
    let description = row.querySelector(".section-description").value;
    const countInTotal = row.querySelector(".count-in-total-checkbox").checked;

    // 如果没有填写描述，则使用环节名称作为描述
    if (!description) {
      description = name;
    }

    if (!name || !duration) {
      alert(`请完整填写第${i + 1}个环节的信息`);
      return;
    }

    sections.push({
      name: name,
      duration: duration,
      description: description,
      countInTotal: countInTotal,
    });

    // 只有在计入总时间时才累加到总时间
    if (countInTotal) {
      totalMinutes += duration;
    }
  }

  // 获取显示设置
  const showCurrentTime = document.getElementById(
    "customShowCurrentTime",
  ).checked;
  const showCountdownTimer = document.getElementById(
    "customShowCountdownTimer",
  ).checked;
  const showSectionTimer = document.getElementById(
    "customShowSectionTimer",
  ).checked;

  // 构造考试时间段字符串
  const startTime = examStartTime;
  const [hours, minutes] = startTime.split(":").map(Number);
  const endTime = new Date(2000, 0, 1, hours, minutes);
  endTime.setMinutes(endTime.getMinutes() + totalMinutes);

  // 检查是否跨日期
  const timeStr = `${endTime.getHours().toString().padStart(2, "0")}:${endTime.getMinutes().toString().padStart(2, "0")}`;
  const isNextDay = endTime.getDate() > 1 || endTime.getHours() < hours;
  const endTimeString = isNextDay ? `${timeStr} (次日)` : timeStr;

  const timeRange = `${startTime} - ${endTimeString}`;

  const customExam = {
    id: editingExamId || Date.now(), // 如果正在编辑则使用原来的ID，否则生成新的
    name: examName,
    startTime: examStartTime,
    date: examDate,
    timeRange: timeRange,
    sections: sections,
    totalMinutes: totalMinutes,
    displaySettings: {
      showCurrentTime,
      showCountdownTimer,
      showSectionTimer,
    },
  };

  if (editingExamId) {
    // 更新现有配置
    const index = customExams.findIndex((exam) => exam.id === editingExamId);
    if (index >= 0) {
      customExams[index] = customExam;
    }
    editingExamId = null; // 重置编辑状态
    document.getElementById("saveCustomExamBtn").textContent = "保存配置";
  } else {
    // 检查是否已存在同名考试
    const existingIndex = customExams.findIndex(
      (exam) => exam.name === examName,
    );
    if (existingIndex >= 0) {
      if (confirm(`已存在名为"${examName}"的考试配置，是否覆盖？`)) {
        customExams[existingIndex] = customExam;
      } else {
        return;
      }
    } else {
      customExams.push(customExam);
    }
  }

  // 保存到localStorage
  localStorage.setItem("customExams", JSON.stringify(customExams));

  alert(`考试"${examName}"配置已保存！`);

  // 清空表单
  clearForm();

  // 重新加载已保存的配置列表
  loadSavedExams();
}

// 加载已保存的配置
function loadSavedExams() {
  // 从localStorage加载
  const savedExams = localStorage.getItem("customExams");
  if (savedExams) {
    try {
      customExams = JSON.parse(savedExams);
    } catch (e) {
      console.error("解析已保存的考试配置失败，使用内存中的默认配置", e);
    }
  }

  // 更新配置列表显示
  const listContainer = document.getElementById("savedExamsList");
  listContainer.innerHTML = "";

  if (customExams.length === 0) {
    listContainer.innerHTML = '<p class="no-exams">暂无保存的配置</p>';
    return;
  }

  customExams.forEach((exam) => {
    const examItem = document.createElement("div");
    examItem.className = "exam-item";
    examItem.innerHTML = `
      <h3>${exam.name}</h3>
      <p>正式考试时间：${exam.date.replace(/-/g, "年")}月</p>
      <p>考试时间: ${exam.timeRange}</p>
      <p>总时长: ${exam.totalMinutes}分钟</p>
      <div class="exam-actions">
        <button class="apply-exam-btn" data-id="${exam.id}">应用</button>
        <button class="edit-exam-btn" data-id="${exam.id}">编辑</button>
        <button class="delete-exam-btn" data-id="${exam.id}">删除</button>
      </div>
    `;

    listContainer.appendChild(examItem);
  });

  // 为新添加的应用、编辑和删除按钮绑定事件
  document.querySelectorAll(".apply-exam-btn").forEach((button) => {
    button.removeEventListener("click", handleApplyClick); // 先移除可能存在的旧监听器
    button.addEventListener("click", handleApplyClick);
  });

  document.querySelectorAll(".edit-exam-btn").forEach((button) => {
    button.removeEventListener("click", handleEditClick);
    button.addEventListener("click", handleEditClick);
  });

  document.querySelectorAll(".delete-exam-btn").forEach((button) => {
    button.removeEventListener("click", handleDeleteClick); // 先移除可能存在的旧监听器
    button.addEventListener("click", handleDeleteClick);
  });
}

// 处理应用按钮点击事件
function handleApplyClick() {
  const examId = parseInt(this.getAttribute("data-id"));
  applySavedExam(examId);
}

// 处理编辑按钮点击事件
function handleEditClick() {
  const examId = parseInt(this.getAttribute("data-id"));
  editSavedExam(examId);
}

// 处理删除按钮点击事件
function handleDeleteClick() {
  const examId = parseInt(this.getAttribute("data-id"));
  deleteSavedExam(examId);
}

// 应用已保存的考试配置
function applySavedExam(examId) {
  const exam = customExams.find((exam) => exam.id === examId);
  if (!exam) {
    alert("未找到选定的考试配置");
    return;
  }

  // 保存选中的考试配置到localStorage，供主页面使用
  localStorage.setItem("selectedCustomExam", JSON.stringify(exam));

  // 跳转到主页面
  window.location.href = "index.html";
}

// 编辑已保存的考试配置
function editSavedExam(examId) {
  const exam = customExams.find((exam) => exam.id === examId);
  if (!exam) {
    alert("未找到选定的考试配置");
    return;
  }

  // 填充表单
  document.getElementById("customExamName").value = exam.name;

  // 设置时间选择器
  const timeInput = document.getElementById("customExamStartTime");
  if (timeInput) {
    timeInput.value = exam.startTime;
    const [hour, minute] = exam.startTime.split(":");
    const hourTrigger = document.querySelector(
      '.time-select-trigger[data-part="hour"]',
    );
    const minuteTrigger = document.querySelector(
      '.time-select-trigger[data-part="minute"]',
    );
    if (hourTrigger)
      hourTrigger.querySelector(".time-value").textContent = hour || "12";
    if (minuteTrigger)
      minuteTrigger.querySelector(".time-value").textContent = minute || "00";

    // 更新选中状态
    const hourOptions = document.querySelector(
      '.time-select-dropdown[data-part="hour"] .time-select-options',
    );
    const minuteOptions = document.querySelector(
      '.time-select-dropdown[data-part="minute"] .time-select-options',
    );
    if (hourOptions) {
      hourOptions.querySelectorAll(".time-option").forEach((opt) => {
        opt.classList.toggle(
          "selected",
          opt.dataset.value === (hour || "12").padStart(2, "0"),
        );
      });
    }
    if (minuteOptions) {
      minuteOptions.querySelectorAll(".time-option").forEach((opt) => {
        opt.classList.toggle(
          "selected",
          opt.dataset.value === (minute || "00").padStart(2, "0"),
        );
      });
    }
  }

  // 设置日期选择器
  const dateInput = document.getElementById("customExamDate");
  if (dateInput) {
    dateInput.value = exam.date;
    const [year, month, day] = exam.date.split("-");
    const yearTrigger = document.querySelector(
      '.date-select-trigger[data-part="year"]',
    );
    const monthTrigger = document.querySelector(
      '.date-select-trigger[data-part="month"]',
    );
    const dayTrigger = document.querySelector(
      '.date-select-trigger[data-part="day"]',
    );
    const dayOptionsContainer = document.querySelector(
      '.date-select-dropdown[data-part="day"] .date-select-options',
    );

    if (yearTrigger)
      yearTrigger.querySelector(".date-value").textContent = year;
    if (monthTrigger)
      monthTrigger.querySelector(".date-value").textContent = month;
    if (dayTrigger) dayTrigger.querySelector(".date-value").textContent = day;

    // 更新日期选项（根据年月确定天数）
    if (dayOptionsContainer) {
      const daysInMonth = new Date(
        parseInt(year),
        parseInt(month),
        0,
      ).getDate();
      dayOptionsContainer.innerHTML = "";
      for (let i = 1; i <= daysInMonth; i++) {
        const option = document.createElement("div");
        option.className = "date-option";
        const dayStr = i.toString().padStart(2, "0");
        option.textContent = dayStr;
        option.dataset.value = dayStr;
        if (dayStr === day) {
          option.classList.add("selected");
        }
        option.addEventListener("click", function (e) {
          e.stopPropagation();
          const value = this.dataset.value;
          const currentDate =
            dateInput.value || new Date().toISOString().split("T")[0];
          let [y, m] = currentDate.split("-");
          dateInput.value = `${y}-${m}-${value}`;
          dayTrigger.querySelector(".date-value").textContent = value;
          dayOptionsContainer
            .querySelectorAll(".date-option")
            .forEach((opt) => {
              opt.classList.toggle("selected", opt.dataset.value === value);
            });
          closeDropdown();
        });
        dayOptionsContainer.appendChild(option);
      }
    }

    // 更新选中状态
    const yearOptions = document.querySelector(
      '.date-select-dropdown[data-part="year"] .date-select-options',
    );
    const monthOptions = document.querySelector(
      '.date-select-dropdown[data-part="month"] .date-select-options',
    );
    if (yearOptions) {
      yearOptions.querySelectorAll(".date-option").forEach((opt) => {
        opt.classList.toggle("selected", opt.dataset.value == year);
      });
    }
    if (monthOptions) {
      monthOptions.querySelectorAll(".date-option").forEach((opt) => {
        opt.classList.toggle("selected", opt.dataset.value === month);
      });
    }
  }

  // 设置显示设置
  if (exam.displaySettings) {
    document.getElementById("customShowCurrentTime").checked =
      exam.displaySettings.showCurrentTime;
    document.getElementById("customShowCountdownTimer").checked =
      exam.displaySettings.showCountdownTimer;
    document.getElementById("customShowSectionTimer").checked =
      exam.displaySettings.showSectionTimer;
  } else {
    // 如果没有显示设置，默认启用所有
    document.getElementById("customShowCurrentTime").checked = true;
    document.getElementById("customShowCountdownTimer").checked = true;
    document.getElementById("customShowSectionTimer").checked = true;
  }

  // 清空现有环节
  const container = document.getElementById("sectionsContainer");
  container.innerHTML = "";

  // 添加环节
  exam.sections.forEach((section) => {
    addSection(
      section.name,
      section.duration,
      section.description,
      section.countInTotal !== false,
    );
  });

  // 确保最后有"考试结束"环节
  const lastCard = container.lastElementChild;
  if (!lastCard || !lastCard.classList.contains("end-section-card")) {
    addEndSection();
  }

  // 更新移动按钮状态

  // 设置编辑状态
  editingExamId = examId;
  document.getElementById("saveCustomExamBtn").textContent = "更新配置";

  // 滚动到表单顶部
  document
    .querySelector(".custom-exam-form")
    .scrollIntoView({ behavior: "smooth" });
}

// 删除已保存的考试配置
function deleteSavedExam(examId) {
  if (!confirm("确定要删除这个考试配置吗？")) {
    return;
  }

  customExams = customExams.filter((exam) => exam.id !== examId);
  localStorage.setItem("customExams", JSON.stringify(customExams));
  loadSavedExams();
}

// 清空表单
function clearForm() {
  document.getElementById("customExamForm").reset();

  // 重新初始化时间选择器（设置为默认值12:00）
  const timeInput = document.getElementById("customExamStartTime");
  if (timeInput) {
    timeInput.value = "12:00";
    const hourTrigger = document.querySelector(
      '.time-select-trigger[data-part="hour"]',
    );
    const minuteTrigger = document.querySelector(
      '.time-select-trigger[data-part="minute"]',
    );
    if (hourTrigger)
      hourTrigger.querySelector(".time-value").textContent = "12";
    if (minuteTrigger)
      minuteTrigger.querySelector(".time-value").textContent = "00";
  }

  // 重新初始化日期选择器（设置为今天）
  const today = new Date();
  const dateInput = document.getElementById("customExamDate");
  if (dateInput) {
    const dateString = today.toISOString().split("T")[0];
    dateInput.value = dateString;
    const [year, month, day] = dateString.split("-");
    const yearTrigger = document.querySelector(
      '.date-select-trigger[data-part="year"]',
    );
    const monthTrigger = document.querySelector(
      '.date-select-trigger[data-part="month"]',
    );
    const dayTrigger = document.querySelector(
      '.date-select-trigger[data-part="day"]',
    );
    if (yearTrigger)
      yearTrigger.querySelector(".date-value").textContent = year;
    if (monthTrigger)
      monthTrigger.querySelector(".date-value").textContent = month;
    if (dayTrigger) dayTrigger.querySelector(".date-value").textContent = day;

    // 更新日期选项
    const dayOptions = document.querySelector(
      '.date-select-dropdown[data-part="day"] .date-select-options',
    );
    if (dayOptions) {
      const daysInMonth = new Date(
        parseInt(year),
        parseInt(month),
        0,
      ).getDate();
      dayOptions.innerHTML = "";
      for (let i = 1; i <= daysInMonth; i++) {
        const option = document.createElement("div");
        option.className = "date-option";
        option.textContent = i.toString().padStart(2, "0");
        option.dataset.value = i.toString().padStart(2, "0");
        dayOptions.appendChild(option);
      }
    }
  }

  // 清空环节容器
  const container = document.getElementById("sectionsContainer");
  container.innerHTML = "";

  // 添加一个默认环节
  addSection();

  // 添加默认的"考试结束"环节
  addEndSection();

  // 重置显示设置为默认值
  initializeDisplaySettings();
}

// 应用当前表单中的自定义考试配置
function applyCustomExam() {
  const examName = document.getElementById("customExamName").value;
  let examStartTimeValue = document.getElementById("customExamStartTime").value;
  const examDate = document.getElementById("customExamDate").value;

  if (!examName) {
    alert("请输入考试名称");
    return;
  }

  // 验证和格式化时间
  const formattedTime = validateAndFormatTime(examStartTimeValue);
  if (!formattedTime) {
    alert("请输入有效的时间格式（HH:MM），例如：09:30");
    document.getElementById("customExamStartTime").focus();
    return;
  }
  examStartTimeValue = formattedTime;
  document.getElementById("customExamStartTime").value = formattedTime;

  const sections = [];
  const sectionRows = document.querySelectorAll(".section-card");
  let totalMinutes = 0;

  // 验证并收集环节信息
  for (let i = 0; i < sectionRows.length; i++) {
    const row = sectionRows[i];
    const name = row.querySelector(".section-name").value;
    const duration = parseInt(row.querySelector(".section-duration").value);
    let description = row.querySelector(".section-description").value;
    const countInTotal = row.querySelector(".count-in-total-checkbox").checked;

    // 如果没有填写描述，则使用环节名称作为描述
    if (!description) {
      description = name;
    }

    if (!name || !duration) {
      alert(`请完整填写第${i + 1}个环节的信息`);
      return;
    }

    sections.push({
      name: name,
      duration: duration,
      description: description,
      countInTotal: countInTotal,
    });

    // 只有在计入总时间时才累加到总时间
    if (countInTotal) {
      totalMinutes += duration;
    }
  }

  // 获取显示设置
  const showCurrentTime = document.getElementById(
    "customShowCurrentTime",
  ).checked;
  const showCountdownTimer = document.getElementById(
    "customShowCountdownTimer",
  ).checked;
  const showSectionTimer = document.getElementById(
    "customShowSectionTimer",
  ).checked;

  // 构造考试时间段字符串
  const startTime = examStartTimeValue;
  const [hours, minutes] = startTime.split(":").map(Number);
  const endTime = new Date(2000, 0, 1, hours, minutes);
  endTime.setMinutes(endTime.getMinutes() + totalMinutes);

  // 检查是否跨日期
  const timeStr = `${endTime.getHours().toString().padStart(2, "0")}:${endTime.getMinutes().toString().padStart(2, "0")}`;
  const isNextDay = endTime.getDate() > 1 || endTime.getHours() < hours;
  const endTimeString = isNextDay ? `${timeStr} (次日)` : timeStr;

  const timeRange = `${startTime} - ${endTimeString}`;

  // 构造考试配置
  const customExam = {
    id: Date.now(), // 添加ID以便在主页面识别
    name: examName,
    startTime: examStartTimeValue,
    date: examDate,
    timeRange: timeRange,
    sections: sections,
    totalMinutes: totalMinutes,
    displaySettings: {
      showCurrentTime,
      showCountdownTimer,
      showSectionTimer,
    },
  };

  // 保存选中的考试配置到localStorage，供主页面使用
  localStorage.setItem("selectedCustomExam", JSON.stringify(customExam));

  // 跳转到主页面
  window.location.href = "index.html";
}

// Node 测试环境导出守卫：浏览器中 document 已定义，不会执行任何导出
// 纯函数定义在 js/exam-utils.js（测试中直接 require 该文件），此处仅作兼容回退
if (typeof document === "undefined" && typeof module !== "undefined" && module.exports) {
  const examUtils = require("./exam-utils.js");
  module.exports = {
    validateAndFormatTime: examUtils.validateAndFormatTime,
  };
}
