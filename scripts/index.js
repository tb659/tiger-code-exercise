// @ts-nocheck

const ROOTS_VARIANTS = ROOTS.map(normalizeRootItem);
const ROOTS_MERGED = ROOTS_MERGED_RAW.map(normalizeRootItem);
const { mergedToVariants, variantToMerged } = buildRootMappings();

// ── DOM 元素引用 ──────────────────────────────────────────────
const rootChar = document.getElementById("rootChar");
const codeInput = document.getElementById("codeInput");
const inputWrap = document.getElementById("inputWrap");
const boxEls = Array.from(document.querySelectorAll(".code-box"));
const revealEl = document.getElementById("reveal");
const statusEl = document.getElementById("status");
const progressEl = document.getElementById("progress");
const correctEl = document.getElementById("correct");
const accuracyEl = document.getElementById("accuracy");
const progressInfoEl = document.getElementById("progressInfo");
const wrongProgressInfoEl = document.getElementById("wrongProgress");
const roundCrownEl = document.getElementById("roundCrown");
const timerEl = document.getElementById("timer");
const modeAllBtn = document.getElementById("modeAll");
const modeMergedBtn = document.getElementById("modeMerged");
const reviewOffBtn = document.getElementById("reviewOff");
const reviewOnBtn = document.getElementById("reviewOn");
const reviewLearnBtn = document.getElementById("reviewLearn");
const reviewFollowBtn = document.getElementById("reviewFollow");
const reviewWrongBtn = document.getElementById("reviewWrong");
const uiShowBtn = document.getElementById("uiShow");
const uiHalfBtn = document.getElementById("uiHalf");
const uiFullBtn = document.getElementById("uiFull");
const themeLightBtn = document.getElementById("themeLight");
const themeDarkBtn = document.getElementById("themeDark");
const paletteSelect = document.getElementById("paletteSelect");
const sizeDownBtn = document.getElementById("sizeDown");
const sizeUpBtn = document.getElementById("sizeUp");
const wrongActionsEl = document.getElementById("wrongActions");
const removeCurrentWrongBtn = document.getElementById("removeCurrentWrong");
const clearAllWrongBtn = document.getElementById("clearAllWrong");

// ── 练习状态变量 ──────────────────────────────────────────────
let order = []; // 打乱后的练习序列（索引数组）
let currentIndex = 0; // order 数组中的当前位置
let currentItemIndex = 0; // 当前正在显示的部首索引
let currentIsReview = false; // 当前项目是否为间隔复习
const statsByMode = {
  learning: { total: 0, correct: 0 },
  normal: { total: 0, correct: 0 },
  review: { total: 0, correct: 0 },
  follow: { total: 0, correct: 0 },
  wrong: { total: 0, correct: 0 },
};
let locked = false; // 动画期间锁定输入
let buffer = ""; // 当前 2 字符输入缓冲
let mode = "all"; // 'all'（全变体）或 'merged'（合并）部首模式
let activeRoots = ROOTS_VARIANTS; // 当前激活的部首数据源引用
let practiceMode = "normal"; // 5 种练习模式之一
let reviewEnabled = practiceMode !== "review"; // 间隔重复开关
let learningMode = practiceMode === "learning"; // 学习模式开关
let uiMode = "show"; // UI 可见性级别
let schemeMode = "light"; // 亮色/暗色主题
let paletteMode = "auto"; // 配色方案选择模式
let activePalette = "one"; // 当前激活的配色方案名称
let autoPaletteBaseIndex = 0; // 自动配色轮换基准索引
let reviewQueue = []; // 间隔重复复习队列
const reviewState = new Map(); // 每个部首的复习阶段 Map
const completedSet = new Set(); // 已掌握部首集合
const wrongByMode = { all: new Set(), merged: new Set() }; // 各模式错题集合
let wrongSet = wrongByMode.all; // 当前模式的错题集合引用
const wrongProgressByMode = { all: new Set(), merged: new Set() }; // 各模式错题纠正进度
let wrongProgressSet = wrongProgressByMode.all; // 当前模式的错题进度引用
const roundsByMode = { all: 0, merged: 0 }; // 各模式已完成轮数
const TIMER_IDLE_MS = 5000; // 空闲超时：5 秒无操作暂停计时
const TIMER_TICK_MS = 250; // 计时器更新间隔：250 毫秒
let timerRunning = false; // 计时器是否正在运行
let timerStart = 0; // 计时器开始时间戳
let timerElapsed = 0; // 已累计的计时时间（毫秒）
let lastKeyAt = 0; // 上次按键时间戳
let timerInterval = null; // 计时器 setInterval ID
const learningSeenByMode = { all: new Set(), merged: new Set() }; // 各模式学习已见记录
let learningSeenSet = learningSeenByMode.all; // 当前模式的已见集合引用
const REVIEW_STEPS = [2, 5, 10]; // 间隔重复间隔步长
let turn = 0; // 全局轮次计数器

// ── 工具函数 ─────────────────────────────────────────────────
// Fisher-Yates 洗牌算法
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// 从激活的部首创建打乱后的练习顺序
function buildOrder() {
  order = shuffle([...activeRoots.keys()]);
  currentIndex = 0;
}

// 重置所有间隔重复状态
function clearReviewState() {
  reviewQueue = [];
  reviewState.clear();
}

// 从复习队列中移除指定项目
function removeFromReviewQueue(idx) {
  reviewQueue = reviewQueue.filter(entry => entry.idx !== idx);
}

// 安排一个项目在将来进行复习
function scheduleReview(idx, stepIndex) {
  const step = REVIEW_STEPS[stepIndex];
  if (step === undefined) return;
  removeFromReviewQueue(idx);
  const dueAt = turn + step;
  reviewQueue.push({ idx, dueAt });
}

// 查找并返回最早到期的复习项目
function getDueReview() {
  if (!reviewQueue.length) return null;
  let bestIndex = -1;
  let bestDue = Infinity;
  for (let i = 0; i < reviewQueue.length; i += 1) {
    const entry = reviewQueue[i];
    if (entry.dueAt <= turn && entry.dueAt < bestDue) {
      bestDue = entry.dueAt;
      bestIndex = i;
    }
  }
  if (bestIndex === -1) return null;
  const [entry] = reviewQueue.splice(bestIndex, 1);
  return entry.idx;
}

// 跳过已完成/正在复习的项目，前进到下一个新项目
function advanceToNextNew() {
  while (currentIndex < order.length) {
    const idx = order[currentIndex];
    if (!completedSet.has(idx) && !reviewState.has(idx)) {
      return;
    }
    currentIndex += 1;
  }
}

// 核心调度：选择下一个要显示的项目
function pickNextItem() {
  if (practiceMode === "wrong") {
    if (!wrongSet.size) {
      currentItemIndex = order[0] ?? 0;
      currentIsReview = false;
      return;
    }
    if (reviewEnabled) {
      const dueIdx = getDueReview();
      if (dueIdx !== null) {
        currentItemIndex = dueIdx;
        currentIsReview = true;
        return;
      }
      if (reviewQueue.length > 0) {
        let bestIndex = 0;
        let bestDue = reviewQueue[0].dueAt;
        for (let i = 1; i < reviewQueue.length; i += 1) {
          if (reviewQueue[i].dueAt < bestDue) {
            bestDue = reviewQueue[i].dueAt;
            bestIndex = i;
          }
        }
        const [entry] = reviewQueue.splice(bestIndex, 1);
        currentItemIndex = entry.idx;
        currentIsReview = true;
        return;
      }
    }
    const wrongList = Array.from(wrongSet);
    currentItemIndex = wrongList[Math.floor(Math.random() * wrongList.length)];
    currentIsReview = false;
    return;
  }
  advanceToNextNew();

  if (reviewEnabled) {
    const dueIdx = getDueReview();
    if (dueIdx !== null) {
      currentItemIndex = dueIdx;
      currentIsReview = true;
      return;
    }
  }

  if (currentIndex >= order.length) {
    if (reviewEnabled && reviewQueue.length > 0) {
      let bestIndex = 0;
      let bestDue = reviewQueue[0].dueAt;
      for (let i = 1; i < reviewQueue.length; i += 1) {
        if (reviewQueue[i].dueAt < bestDue) {
          bestDue = reviewQueue[i].dueAt;
          bestIndex = i;
        }
      }
      const [entry] = reviewQueue.splice(bestIndex, 1);
      currentItemIndex = entry.idx;
      currentIsReview = true;
      return;
    }
    if (completedSet.size >= activeRoots.length) {
      handleProgressReset();
      completedSet.clear();
      clearReviewState();
    }
    // 初始构建练习顺序并渲染第一题
    buildOrder();
    advanceToNextNew();
  }

  if (currentIndex >= order.length) {
    currentItemIndex = order[0] ?? 0;
  } else {
    currentItemIndex = order[currentIndex];
  }
  currentIsReview = false;
}

// UI 尺寸预设数组（7 级）
const sizePresets = [
  { rootMin: 18, rootVw: "2.6vw", rootMax: 34, box: 24, boxFont: 14, boxMobile: 20, boxMobileFont: 12 },
  { rootMin: 20, rootVw: "2.9vw", rootMax: 38, box: 27, boxFont: 15, boxMobile: 23, boxMobileFont: 13 },
  { rootMin: 22, rootVw: "3.2vw", rootMax: 40, box: 30, boxFont: 16, boxMobile: 26, boxMobileFont: 14 },
  { rootMin: 24, rootVw: "3.5vw", rootMax: 44, box: 34, boxFont: 18, boxMobile: 30, boxMobileFont: 16 },
  { rootMin: 26, rootVw: "3.8vw", rootMax: 48, box: 38, boxFont: 20, boxMobile: 34, boxMobileFont: 18 },
  { rootMin: 28, rootVw: "4.1vw", rootMax: 52, box: 42, boxFont: 22, boxMobile: 38, boxMobileFont: 20 },
  { rootMin: 30, rootVw: "4.4vw", rootMax: 56, box: 46, boxFont: 24, boxMobile: 42, boxMobileFont: 22 },
];
let sizeIndex = 3;

// 应用当前尺寸预设到 CSS 变量
function applySize() {
  const preset = sizePresets[sizeIndex];
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--root-min", `${preset.rootMin}px`);
  rootStyle.setProperty("--root-vw", preset.rootVw);
  rootStyle.setProperty("--root-max", `${preset.rootMax}px`);
  rootStyle.setProperty("--box-size", `${preset.box}px`);
  rootStyle.setProperty("--box-font", `${preset.boxFont}px`);
  rootStyle.setProperty("--box-size-mobile", `${preset.boxMobile}px`);
  rootStyle.setProperty("--box-font-mobile", `${preset.boxMobileFont}px`);
  if (sizeDownBtn) sizeDownBtn.disabled = sizeIndex === 0;
  if (sizeUpBtn) sizeUpBtn.disabled = sizeIndex === sizePresets.length - 1;
}

// 规范化部首标签格式（括号统一为全角）
function normalizeRootLabel(label) {
  return label.replace(/囗\(框\)/g, "囗（框）");
}

// 规范化一个部首数据项
function normalizeRootItem(item) {
  return { root: normalizeRootLabel(item.root), code: item.code };
}

// 移除空白字符用于匹配
function normalizeMatch(value) {
  return value.replace(/\s+/g, "");
}

// 构建合并部首↔变体部首的双向索引映射
function buildRootMappings() {
  const mergedToVariants = Array.from({ length: ROOTS_MERGED.length }, () => []);
  const variantToMerged = Array(ROOTS_VARIANTS.length).fill(-1);
  const mergedByCode = new Map();

  ROOTS_MERGED.forEach((item, idx) => {
    const list = mergedByCode.get(item.code) || [];
    list.push({ idx, root: normalizeMatch(item.root) });
    mergedByCode.set(item.code, list);
  });

  ROOTS_VARIANTS.forEach((item, vIdx) => {
    const list = mergedByCode.get(item.code);
    if (!list) return;
    const vRoot = normalizeMatch(item.root);
    const match = list.find(entry => entry.root.includes(vRoot));
    if (!match) return;
    variantToMerged[vIdx] = match.idx;
    mergedToVariants[match.idx].push(vIdx);
  });

  return { mergedToVariants, variantToMerged };
}

// ── 进度映射函数 ─────────────────────────────────────────────
// 返回已完成的索引数组
function getCompletedIndices() {
  return Array.from(completedSet);
}

// 返回错题的索引数组
function getWrongIndices() {
  return Array.from(wrongSet);
}

// 将变体部首的完成状态映射到合并部首索引
function mapCompletedToMerged(completedVariants) {
  const mergedSet = new Set();
  completedVariants.forEach(vIdx => {
    const mergedIdx = variantToMerged[vIdx];
    if (mergedIdx >= 0) mergedSet.add(mergedIdx);
  });
  return mergedSet;
}

// 将合并部首的完成状态映射到变体部首索引
function mapCompletedToVariants(completedMerged) {
  const variantSet = new Set();
  completedMerged.forEach(mIdx => {
    const list = mergedToVariants[mIdx] || [];
    list.forEach(vIdx => variantSet.add(vIdx));
  });
  return variantSet;
}

// 重建练习顺序，已完成项目排在前面
function buildOrderWithCompleted(completedSet) {
  const totalItems = activeRoots.length;
  const completed = [];
  completedSet.forEach(idx => {
    if (idx >= 0 && idx < totalItems) completed.push(idx);
  });
  completed.sort((a, b) => a - b);

  const remaining = [];
  for (let i = 0; i < totalItems; i += 1) {
    if (!completedSet.has(i)) remaining.push(i);
  }
  shuffle(remaining);
  order = completed.concat(remaining);
  currentIndex = completed.length;
}

// ── 输入处理与渲染 ───────────────────────────────────────────
// 转小写，去除非字母字符，限制为 2 个字符
function normalizeInput(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 2);
}

// 更新两个代码框显示元素
function renderBoxes(value) {
  const padded = value.padEnd(2, "");
  boxEls.forEach((box, idx) => {
    const ch = padded[idx] || "";
    box.textContent = ch;
  });
}

// 显示正确答案代码
function showReveal(code) {
  revealEl.textContent = code;
  revealEl.classList.add("is-show");
}

// 隐藏已揭示的答案
function hideReveal() {
  revealEl.textContent = "";
  revealEl.classList.remove("is-show");
}

// 在学习模式中标记部首已见（首次返回 true）
function registerSeen(idx) {
  if (learningSeenSet.has(idx)) return false;
  learningSeenSet.add(idx);
  return true;
}

// 为首次见到的部首显示代码提示
function applyLearningIntro(item) {
  showReveal(item.code);
}

// 学习模式处理：首次见到时显示提示
function handleLearningIntro(item) {
  if (!learningMode) return;
  const firstSeen = registerSeen(currentItemIndex);
  if (!firstSeen) return;
  markWrong(currentItemIndex);
  applyLearningIntro(item);
}

// 跟随模式处理：始终显示代码
function handleFollowIntro(item) {
  if (practiceMode !== "follow") return;
  showReveal(item.code);
}

// 无错题时显示空状态
function renderWrongEmpty() {
  rootChar.textContent = "—";
  inputWrap.classList.remove("is-error");
  clearBuffer();
  showReveal("暂无错题");
  locked = true;
}

// ── 核心状态变更 ─────────────────────────────────────────────
// 将部首标记为错误，重置复习状态
function markWrong(rootIndex) {
  wrongSet.add(rootIndex);
  wrongProgressSet.delete(rootIndex);
  if (reviewEnabled) {
    completedSet.delete(rootIndex);
    const state = reviewState.get(rootIndex) || { stage: 0 };
    state.stage = 0;
    reviewState.set(rootIndex, state);
    removeFromReviewQueue(rootIndex);
  }
  updateProgress();
  scheduleSync();
}

// 将部首标记为正确，推进复习阶段
function markCorrect(rootIndex) {
  let mastered = false;
  if (!reviewEnabled) {
    completedSet.add(rootIndex);
    mastered = true;
  } else {
    const state = reviewState.get(rootIndex);
    if (!state) {
      completedSet.add(rootIndex);
      mastered = true;
    } else {
      state.stage += 1;
      if (state.stage >= REVIEW_STEPS.length) {
        reviewState.delete(rootIndex);
        removeFromReviewQueue(rootIndex);
        completedSet.add(rootIndex);
        mastered = true;
      } else {
        reviewState.set(rootIndex, state);
        scheduleReview(rootIndex, state.stage - 1);
      }
    }
  }
  updateProgress();
  if (mastered && wrongSet.has(rootIndex)) {
    wrongProgressSet.add(rootIndex);
  }
  scheduleSync();
}

// 为错误答案应用视觉反馈
function applyWrong(item) {
  updateStats();
  inputWrap.classList.add("is-error");
  showReveal(item.code);
  flashStatus("错误，重打", "bad");
  shakeInput();
  clearBuffer();
  locked = false;
  codeInput.focus();
}

// 手动将当前项目标记为错误（空格键触发）
function triggerWrong() {
  if (locked) return;
  const item = activeRoots[currentItemIndex];
  locked = true;
  statsByMode[practiceMode].total += 1;
  markWrong(currentItemIndex);
  applyWrong(item);
}

// ── 输入缓冲与状态更新 ───────────────────────────────────────
// 重置输入缓冲和代码框
function clearBuffer() {
  buffer = "";
  codeInput.value = "";
  renderBoxes("");
}

// 更新缓冲区，输入满 2 个字符时自动提交
function setBuffer(value) {
  if (locked) return;
  buffer = normalizeInput(value);
  codeInput.value = buffer;
  renderBoxes(buffer);
  if (statusEl && buffer.length > 0 && statusEl.dataset.state !== "idle") {
    setIdleStatus();
  }
  if (buffer.length >= 2) {
    submitAnswer(buffer);
  }
}

// 更新准确率/进度显示
function updateStats() {
  const s = statsByMode[practiceMode];
  if (progressEl) progressEl.textContent = String(s.total);
  if (correctEl) correctEl.textContent = String(s.correct);
  if (accuracyEl) accuracyEl.textContent = s.total ? `${Math.round((s.correct / s.total) * 100)}%` : "0%";
}

// 同步全变体/合并按钮的激活状态
function updateModeButtons() {
  const isMerged = mode === "merged";
  if (modeAllBtn) {
    modeAllBtn.classList.toggle("is-active", !isMerged);
    modeAllBtn.setAttribute("aria-pressed", String(!isMerged));
  }
  if (modeMergedBtn) {
    modeMergedBtn.classList.toggle("is-active", isMerged);
    modeMergedBtn.setAttribute("aria-pressed", String(isMerged));
  }
}

// 同步练习模式按钮的激活状态
function updatePracticeButtons() {
  if (reviewOffBtn) {
    const active = practiceMode === "normal";
    reviewOffBtn.classList.toggle("is-active", active);
    reviewOffBtn.setAttribute("aria-pressed", String(active));
  }
  if (reviewOnBtn) {
    const active = practiceMode === "review";
    reviewOnBtn.classList.toggle("is-active", active);
    reviewOnBtn.setAttribute("aria-pressed", String(active));
  }
  if (reviewLearnBtn) {
    const active = practiceMode === "learning";
    reviewLearnBtn.classList.toggle("is-active", active);
    reviewLearnBtn.setAttribute("aria-pressed", String(active));
  }
  if (reviewFollowBtn) {
    const active = practiceMode === "follow";
    reviewFollowBtn.classList.toggle("is-active", active);
    reviewFollowBtn.setAttribute("aria-pressed", String(active));
  }
  if (reviewWrongBtn) {
    const active = practiceMode === "wrong";
    reviewWrongBtn.classList.toggle("is-active", active);
    reviewWrongBtn.setAttribute("aria-pressed", String(active));
  }
}

// 应用练习模式状态到 body 类名
function syncPracticeState(nextMode) {
  const nextReviewEnabled = nextMode === "normal" || nextMode === "learning" || nextMode === "wrong";
  const nextLearningMode = nextMode === "learning";
  document.body.classList.toggle("practice-wrong", nextMode === "wrong");
  if (reviewEnabled !== nextReviewEnabled) {
    reviewEnabled = nextReviewEnabled;
    if (!reviewEnabled) {
      clearReviewState();
    }
  }
  learningMode = nextLearningMode;
  document.body.classList.toggle("learning-mode", learningMode);
}

// 切换练习模式并重新渲染
function setPracticeMode(nextMode) {
  if (nextMode === practiceMode) return;
  practiceMode = nextMode;
  syncPracticeState(nextMode);
  updatePracticeButtons();
  updateStats();
  locked = false;
  if (practiceMode === "wrong") {
    renderQuestion();
  } else {
    renderCurrent();
  }
  scheduleSync();
}

// ── UI 设置函数 ──────────────────────────────────────────────
// 同步 UI 可见性按钮状态
function updateUiButtons() {
  if (uiShowBtn) {
    const active = uiMode === "show";
    uiShowBtn.classList.toggle("is-active", active);
    uiShowBtn.setAttribute("aria-pressed", String(active));
  }
  if (uiHalfBtn) {
    const active = uiMode === "half";
    uiHalfBtn.classList.toggle("is-active", active);
    uiHalfBtn.setAttribute("aria-pressed", String(active));
  }
  if (uiFullBtn) {
    const active = uiMode === "full";
    uiFullBtn.classList.toggle("is-active", active);
    uiFullBtn.setAttribute("aria-pressed", String(active));
  }
}

// 应用 UI 可见性模式（显示/半隐藏/全隐藏）
function setUiMode(nextMode) {
  uiMode = nextMode;
  document.body.classList.toggle("ui-half", uiMode === "half");
  document.body.classList.toggle("ui-full", uiMode === "full");
  updateUiButtons();
}

// 同步亮色/暗色按钮状态
function updateThemeButtons() {
  if (themeLightBtn) {
    const active = schemeMode === "light";
    themeLightBtn.classList.toggle("is-active", active);
    themeLightBtn.setAttribute("aria-pressed", String(active));
  }
  if (themeDarkBtn) {
    const active = schemeMode === "dark";
    themeDarkBtn.classList.toggle("is-active", active);
    themeDarkBtn.setAttribute("aria-pressed", String(active));
  }
}

// 可用配色方案名称列表
const paletteOptions = ["one", "solarized", "nord", "catppuccin", "gruvbox", "tokyonight", "rosepine"];

// 同步配色方案下拉菜单值
function updatePaletteSelect() {
  if (!paletteSelect) return;
  paletteSelect.value = paletteMode;
}

// 应用亮色/暗色主题到 body
function setSchemeMode(nextMode) {
  schemeMode = nextMode;
  document.body.classList.toggle("theme-dark", schemeMode === "dark");
  updateThemeButtons();
}

// 根据完成数量计算自动配色方案
function getAutoPalette() {
  const bucket = Math.floor((completedSet.size || 0) / 100);
  const index = (autoPaletteBaseIndex + bucket) % paletteOptions.length;
  return paletteOptions[index];
}

// 处理完成一整轮时的逻辑（增加皇冠数，轮换配色）
function handleProgressReset() {
  if (practiceMode !== "wrong") {
    roundsByMode[mode] = (roundsByMode[mode] || 0) + 1;
  }
  if (paletteMode !== "auto") return;
  const currentIndex = paletteOptions.indexOf(activePalette);
  autoPaletteBaseIndex = currentIndex >= 0 ? currentIndex : 0;
  scheduleSync();
}

// 应用指定名称的配色方案
function applyPalette(name) {
  activePalette = name;
  paletteOptions.forEach(palette => {
    document.body.classList.toggle(`theme-${palette}`, palette === name);
  });
}

// 切换配色方案模式（自动或手动）
function setPaletteMode(nextMode) {
  paletteMode = nextMode;
  if (paletteMode === "auto") {
    const currentIndex = paletteOptions.indexOf(activePalette);
    const bucket = Math.floor((completedSet.size || 0) / 100);
    const base = currentIndex - bucket;
    autoPaletteBaseIndex = ((base % paletteOptions.length) + paletteOptions.length) % paletteOptions.length;
  }
  const target = paletteMode === "auto" ? getAutoPalette() : paletteMode;
  applyPalette(target);
  updatePaletteSelect();
}

// 自动模式下自动切换配色方案
function maybeAutoPalette() {
  if (paletteMode !== "auto") return;
  const target = getAutoPalette();
  if (target !== activePalette) {
    applyPalette(target);
  }
  updatePaletteSelect();
}

// 在全变体/合并部首模式之间切换
function setMode(nextMode) {
  if (nextMode === mode) return;
  const completed = getCompletedIndices();
  let targetCompleted = new Set();
  if (mode === "all" && nextMode === "merged") {
    targetCompleted = mapCompletedToMerged(completed);
  } else if (mode === "merged" && nextMode === "all") {
    targetCompleted = mapCompletedToVariants(completed);
  }
  mode = nextMode;
  activeRoots = mode === "merged" ? ROOTS_MERGED : ROOTS_VARIANTS;
  learningSeenSet = mode === "merged" ? learningSeenByMode.merged : learningSeenByMode.all;
  wrongSet = mode === "merged" ? wrongByMode.merged : wrongByMode.all;
  wrongProgressSet = mode === "merged" ? wrongProgressByMode.merged : wrongProgressByMode.all;
  completedSet.clear();
  targetCompleted.forEach(idx => completedSet.add(idx));
  clearReviewState();
  buildOrderWithCompleted(targetCompleted);
  renderQuestion();
  updateModeButtons();
  scheduleSync();
}

// 更新进度显示（X/Y、错题进度、皇冠）
function updateProgress() {
  const totalItems = activeRoots.length || 0;
  const current = totalItems ? completedSet.size : 0;
  if (progressInfoEl) {
    progressInfoEl.textContent = `${current}/${totalItems}`;
  }
  if (wrongProgressInfoEl) {
    let wrongDone = 0;
    if (wrongProgressSet.size) {
      wrongProgressSet.forEach(idx => {
        if (wrongSet.has(idx)) wrongDone += 1;
      });
    }
    if (practiceMode === "wrong" && wrongSet.size > 0 && wrongDone >= wrongSet.size) {
      wrongProgressSet.clear();
      wrongDone = 0;
    }
    wrongProgressInfoEl.textContent = `${wrongDone}/${wrongSet.size}`;
  }
  if (roundCrownEl) {
    const rounds = roundsByMode[mode] || 0;
    const crownText = rounds <= 0 ? "" : rounds === 1 ? "👑" : `👑×${rounds}`;
    roundCrownEl.textContent = crownText;
    roundCrownEl.classList.toggle("is-empty", rounds <= 0);
  }
  maybeAutoPalette();
}

// ── 计时器 ───────────────────────────────────────────────────
// 将毫秒格式化为 MM:SS 或 H:MM:SS
function formatTimer(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// 刷新计时器显示元素
function updateTimerDisplay() {
  if (!timerEl) return;
  const total = timerElapsed + (timerRunning ? Date.now() - timerStart : 0);
  timerEl.textContent = formatTimer(total);
}

// 暂停计时器，累计已用时间
function pauseTimer() {
  if (!timerRunning) return;
  timerElapsed += Date.now() - timerStart;
  timerRunning = false;
  timerStart = 0;
}

// 记录按键时间，空闲时启动计时器
function registerActivity() {
  const now = Date.now();
  lastKeyAt = now;
  if (!timerRunning) {
    timerRunning = true;
    timerStart = now;
  }
}

// 每 250ms 调用一次，空闲 5 秒后自动暂停
function tickTimer() {
  if (timerRunning && Date.now() - lastKeyAt >= TIMER_IDLE_MS) {
    pauseTimer();
  }
  updateTimerDisplay();
}

// ── UI 辅助函数 ──────────────────────────────────────────────
// 简短显示一条状态消息，带状态颜色
function flashStatus(text, state) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

// 显示"等待输入"空闲消息
function setIdleStatus() {
  if (!statusEl) return;
  flashStatus("等待输入", "idle");
}

// 对输入区域触发抖动动画
function shakeInput() {
  inputWrap.classList.remove("shake");
  void inputWrap.offsetWidth;
  inputWrap.classList.add("shake");
  setTimeout(() => inputWrap.classList.remove("shake"), 260);
}

// ── 渲染与答题 ──────────────────────────────────────────────
// 渲染当前部首并重置输入状态
function renderCurrent(options = {}) {
  if (practiceMode === "wrong" && wrongSet.size === 0) {
    renderWrongEmpty();
    return;
  }
  locked = false;
  const item = activeRoots[currentItemIndex];
  rootChar.textContent = item.root;
  inputWrap.classList.remove("is-error");
  hideReveal();
  clearBuffer();
  updateProgress();
  if (!options.keepStatus) {
    setIdleStatus();
  }
  handleLearningIntro(item);
  handleFollowIntro(item);
  codeInput.focus();
}

// 选择下一个项目并渲染
function renderQuestion(options = {}) {
  pickNextItem();
  renderCurrent(options);
  turn += 1;
}

// 验证并检查用户答案
function submitAnswer(value) {
  if (locked) return;
  const item = activeRoots[currentItemIndex];
  const code = value.slice(0, 2);
  if (code.length < 2) return;

  locked = true;
  statsByMode[practiceMode].total += 1;

  if (code === item.code) {
    statsByMode[practiceMode].correct += 1;
    updateStats();
    markCorrect(currentItemIndex);
    inputWrap.classList.remove("is-error");
    if (practiceMode !== "follow") {
      hideReveal();
    }
    flashStatus("正确 ✓", "good");
    if (!currentIsReview && practiceMode !== "wrong") {
      currentIndex += 1;
    }
    locked = false;
    renderQuestion({ keepStatus: true });
  } else {
    markWrong(currentItemIndex);
    applyWrong(item);
  }
}

// ── 事件监听 ─────────────────────────────────────────────────
// 处理文本输入变化
codeInput.addEventListener("input", e => {
  setBuffer(e.target.value);
});

// 处理输入框按键（回车提交，空格标记错误）
codeInput.addEventListener("keydown", e => {
  registerActivity();
  if (e.key === "Enter") {
    submitAnswer(buffer);
    return;
  }
  if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    triggerWrong();
  }
});

// 全局键盘快捷键（输入框未聚焦时）
document.addEventListener("keydown", e => {
  if (document.activeElement === codeInput) return;
  registerActivity();
  if (locked) return;
  if (e.key === "Backspace") {
    e.preventDefault();
    setBuffer(buffer.slice(0, -1));
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    submitAnswer(buffer);
    return;
  }
  if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    triggerWrong();
    return;
  }
  if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
    e.preventDefault();
    setBuffer(buffer + e.key);
  }
});

// 点击卡片聚焦输入框
document.getElementById("card").addEventListener("click", () => {
  codeInput.focus();
});

// 绑定模式切换按钮
if (modeAllBtn && modeMergedBtn) {
  modeAllBtn.addEventListener("click", () => setMode("all"));
  modeMergedBtn.addEventListener("click", () => setMode("merged"));
}

// 绑定练习模式按钮
if (reviewOffBtn && reviewOnBtn && reviewLearnBtn && reviewFollowBtn && reviewWrongBtn) {
  reviewOffBtn.addEventListener("click", () => setPracticeMode("normal"));
  reviewOnBtn.addEventListener("click", () => setPracticeMode("review"));
  reviewLearnBtn.addEventListener("click", () => setPracticeMode("learning"));
  reviewFollowBtn.addEventListener("click", () => setPracticeMode("follow"));
  reviewWrongBtn.addEventListener("click", () => setPracticeMode("wrong"));
}

// 绑定 UI 可见性按钮
if (uiShowBtn && uiHalfBtn && uiFullBtn) {
  uiShowBtn.addEventListener("click", () => setUiMode("show"));
  uiHalfBtn.addEventListener("click", () => setUiMode("half"));
  uiFullBtn.addEventListener("click", () => setUiMode("full"));
}

// 绑定亮色/暗色切换按钮
if (themeLightBtn && themeDarkBtn) {
  themeLightBtn.addEventListener("click", () => setSchemeMode("light"));
  themeDarkBtn.addEventListener("click", () => setSchemeMode("dark"));
}

// 绑定配色方案下拉菜单
if (paletteSelect) {
  paletteSelect.addEventListener("change", e => setPaletteMode(e.target.value));
}

// 绑定字体大小增减按钮
if (sizeDownBtn && sizeUpBtn) {
  sizeDownBtn.addEventListener("click", () => {
    sizeIndex = Math.max(0, sizeIndex - 1);
    applySize();
  });
  sizeUpBtn.addEventListener("click", () => {
    sizeIndex = Math.min(sizePresets.length - 1, sizeIndex + 1);
    applySize();
  });
}

// ── 错题操作按钮 ────────────────────────────────────────────
/** 清空所有错题 */
clearAllWrongBtn.addEventListener("click", async () => {
  if (!confirm("确定要清空所有错题吗？此操作不可撤销。")) return;
  wrongByMode.all.clear();
  wrongByMode.merged.clear();
  wrongProgressByMode.all.clear();
  wrongProgressByMode.merged.clear();
  wrongSet = wrongByMode[mode];
  wrongProgressSet = wrongProgressByMode[mode];
  updateProgress();
  if (practiceMode === "wrong") {
    renderQuestion();
  }
  await pushProgress();
  updateSyncUi("错题已清空", "");
  setTimeout(() => updateSyncUi("已同步", ""), 1500);
});

/** 删除当前显示的错题 */
removeCurrentWrongBtn.addEventListener("click", async () => {
  if (practiceMode !== "wrong" || !wrongSet.has(currentItemIndex)) return;
  wrongSet.delete(currentItemIndex);
  wrongProgressSet.delete(currentItemIndex);
  updateProgress();
  renderQuestion();
  await pushProgress();
});

// ── 初始化 ───────────────────────────────────────────────────
// 应用默认字体大小
applySize();
updateModeButtons();
syncPracticeState(practiceMode);
updatePracticeButtons();
setUiMode(uiMode);
setPaletteMode(paletteMode);
setSchemeMode(schemeMode);

// ── 光标自动隐藏 ─────────────────────────────────────────────
const CURSOR_HIDE_DELAY = 1500;
let cursorTimer = null;
let cursorHidden = false;

function hideCursor() {
  if (cursorHidden) return;
  document.body.classList.add("cursor-hidden");
  cursorHidden = true;
}

function showCursor() {
  if (!cursorHidden) return;
  document.body.classList.remove("cursor-hidden");
  cursorHidden = false;
}

function resetCursorTimer() {
  showCursor();
  if (cursorTimer) clearTimeout(cursorTimer);
  cursorTimer = setTimeout(hideCursor, CURSOR_HIDE_DELAY);
}

document.addEventListener("mousemove", resetCursorTimer, { passive: true });
document.addEventListener("mousedown", resetCursorTimer, { passive: true });
document.addEventListener("wheel", resetCursorTimer, { passive: true });
resetCursorTimer();
updateTimerDisplay();
timerInterval = setInterval(tickTimer, TIMER_TICK_MS);

// 初始构建练习顺序并渲染第一题
buildOrder();
renderQuestion();
updateStats();

// ═══════════════════════════════════════════════════════════════
//  云端同步模块 (Supabase)
//  功能：将练习进度保存到 Supabase 云端数据库，实现跨设备同步。
//  流程：本地状态变化 → 节流60秒 → 推送到云端
//        点击「同步」→ 先推再拉 → 本地与云端保持一致
// ═══════════════════════════════════════════════════════════════

// ── Supabase 连接配置 ────────────────────────────────────────
// 从 Supabase Dashboard → Settings → API 中获取
const SUPABASE_URL = "https://yolswumhhicjpobwdpev.supabase.co"; // 项目地址
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbHN3dW1oaGljanBvYndkcGV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NjE1ODgsImV4cCI6MjEwMDQzNzU4OH0.FgZt_I0m-Kc4zaEgnIxGWtoHdeSl-tHHBvvKr0Apcmk"; // 匿名访问密钥

// ── 同步状态变量 ──────────────────────────────────────────────
let sb = null; // Supabase 客户端实例，初始化后不再为 null
let userId = localStorage.getItem("tc_uid"); // 用户唯一标识，持久化在 localStorage 中
let syncTimer = null; // 节流定时器 ID，用于取消和重置
const SYNC_MS = 60000; // 节流间隔：60秒内最多推送一次，避免浪费 API 额度

// ── DOM 元素引用 ──────────────────────────────────────────────
const syncStatusEl = document.getElementById("syncStatus"); // 状态文字（已同步/同步中…/同步失败）
const syncSetupBtn = document.getElementById("syncSetup"); // 「连接」按钮
const syncBtn = document.getElementById("sync"); // 「同步」按钮（先推再拉）
const syncIdInput = document.getElementById("syncIdInput"); // 输入框：粘贴旧设备 ID
const syncIdConfirm = document.getElementById("syncIdConfirm"); // 「确认」按钮：确认输入的 ID
const syncIdDisplay = document.getElementById("syncIdDisplay"); // UUID 显示区域，点击可复制

// ── UI 状态切换函数 ──────────────────────────────────────────

/** 更新同步状态文字和样式 */
function updateSyncUi(text, type) {
  if (!syncStatusEl) return;
  syncStatusEl.textContent = text;
  // type: '' = 正常, 'syncing' = 加载中(半透明), 'error' = 错误(红色)
  syncStatusEl.className = "sync-status" + (type ? " is-" + type : "");
}

/** 已连接状态：隐藏输入框，显示同步按钮和 UUID */
function showConnectedUi() {
  syncSetupBtn.style.display = "none"; // 隐藏「连接」按钮
  syncIdInput.style.display = "none"; // 隐藏 ID 输入框
  syncIdConfirm.style.display = "none"; // 隐藏「确认」按钮
  syncBtn.style.display = ""; // 显示「同步」按钮
  syncIdDisplay.style.display = ""; // 显示 UUID（可点击复制）
  syncIdDisplay.textContent = userId; // 设置 UUID 文字
  syncIdDisplay.title = "点击复制 ID：" + userId; // 悬浮提示
}

/** 新设备状态：显示 ID 输入框，让用户粘贴旧设备 ID 或留空新建 */
function showNewDeviceUi() {
  syncSetupBtn.style.display = "none";
  syncIdInput.style.display = ""; // 显示输入框
  syncIdConfirm.style.display = ""; // 显示「确认」按钮
  syncBtn.style.display = "none"; // 隐藏「同步」按钮
  syncIdDisplay.style.display = "none"; // 隐藏 UUID 显示
}

// ── 数据序列化 / 反序列化 ────────────────────────────────────
//  由于 Set、Map 等类型无法直接 JSON 化，需要转换后再存储。
//  字段名使用缩写以减小传输体积。

/**
 * 将当前所有练习进度序列化为 JSON 可存储的对象
 * @returns {Object} 包含所有状态的扁平对象
 */
function serializeState() {
  return {
    cs: [...completedSet], // 已掌握的字根索引集合
    wb: { a: [...wrongByMode.all], m: [...wrongByMode.merged] }, // 错题集（全字根 / 归并字根）
    wp: { a: [...wrongProgressByMode.all], m: [...wrongProgressByMode.merged] }, // 错题纠正进度
    rs: Object.fromEntries(reviewState), // 间隔复习状态 Map → {索引: {stage}}
    rq: reviewQueue, // 待复习队列 [{idx, dueAt}]
    t: turn, // 全局轮次计数器（用于计算复习到期时间）
    st: Object.fromEntries(Object.entries(statsByMode).map(([k, v]) => [k, [v.total, v.correct]])), // 各模式答题统计
    rm: { a: roundsByMode.all, m: roundsByMode.merged }, // 各模式完成轮数（👑显示用）
    ls: { a: [...learningSeenByMode.all], m: [...learningSeenByMode.merged] }, // 学习模式已见字根
    md: mode, // 当前字根模式：'all'(全字根) 或 'merged'(归并)
    pm: practiceMode, // 当前练习模式：normal/review/learning/follow/wrong
    si: sizeIndex, // UI 字号大小索引 (0-6)
    sm: schemeMode, // 主题：'light' 或 'dark'
    pl: paletteMode, // 配色方案：'auto'/'solarized'/'nord' 等
    ap: autoPaletteBaseIndex, // 自动轮换配色的基准索引
    ts: Date.now(), // 时间戳（毫秒），用于判断数据新旧
  };
}

/**
 * 从 JSON 对象恢复所有练习进度到本地内存变量
 * 注意：const 声明的集合（completedSet 等）不能重新赋值，
 *       必须先 .clear() 再逐个 .add()。
 * @param {Object} d - 由 serializeState() 生成的对象
 */
function deserializeState(d) {
  // ── 恢复集合类型数据（Set 需要 clear + add） ──
  completedSet.clear();
  (d.cs || []).forEach(i => completedSet.add(i)); // 已掌握字根

  wrongByMode.all.clear();
  wrongByMode.merged.clear();
  (d.wb?.a || []).forEach(i => wrongByMode.all.add(i)); // 全字根错题
  (d.wb?.m || []).forEach(i => wrongByMode.merged.add(i)); // 归并错题

  wrongProgressByMode.all.clear();
  wrongProgressByMode.merged.clear();
  (d.wp?.a || []).forEach(i => wrongProgressByMode.all.add(i)); // 全字根错题纠正
  (d.wp?.m || []).forEach(i => wrongProgressByMode.merged.add(i));

  reviewState.clear();
  Object.entries(d.rs || {}).forEach(([k, v]) => reviewState.set(Number(k), v)); // 间隔复习状态

  // ── 恢复普通变量（let 声明，可直接赋值） ──
  reviewQueue = d.rq || []; // 待复习队列
  turn = d.t || 0; // 全局轮次

  // 恢复各模式答题统计（兼容旧格式：to/c 为旧的全局统计）
  if (d.st) {
    Object.entries(d.st).forEach(([k, v]) => {
      if (statsByMode[k]) {
        statsByMode[k].total = v[0] || 0;
        statsByMode[k].correct = v[1] || 0;
      }
    });
  } else {
    statsByMode.normal.total = d.to || 0;
    statsByMode.normal.correct = d.c || 0;
  }

  roundsByMode.all = d.rm?.a || 0; // 全字根完成轮数
  roundsByMode.merged = d.rm?.m || 0; // 归并完成轮数

  learningSeenByMode.all.clear();
  learningSeenByMode.merged.clear();
  (d.ls?.a || []).forEach(i => learningSeenByMode.all.add(i)); // 学习模式已见（全字根）
  (d.ls?.m || []).forEach(i => learningSeenByMode.merged.add(i));

  // ── 恢复模式状态并重建引用 ──
  if (d.md) {
    mode = d.md;
    activeRoots = mode === "merged" ? ROOTS_MERGED : ROOTS_VARIANTS; // 切换字根数据源
  }
  // 重新绑定当前模式下的快捷引用
  wrongSet = wrongByMode[mode];
  wrongProgressSet = wrongProgressByMode[mode];
  learningSeenSet = learningSeenByMode[mode];

  // ── 恢复 UI 设置 ──
  if (d.pm) {
    practiceMode = d.pm;
    syncPracticeState(practiceMode);
    updatePracticeButtons();
  }
  if (d.si != null) {
    sizeIndex = d.si;
    applySize();
  }
  if (d.sm) setSchemeMode(d.sm);
  if (d.pl) setPaletteMode(d.pl);
  autoPaletteBaseIndex = d.ap || 0;

  // ── 重建练习序列并渲染 ──
  updateModeButtons();
  buildOrderWithCompleted(completedSet); // 保留已完成项的顺序，随机打乱未完成项
  if (practiceMode === "wrong") {
    renderQuestion(); // 错题模式需要 pickNextItem 从 wrongSet 中选题
  } else {
    renderCurrent(); // 渲染当前题目
  }
  updateStats(); // 更新准确率、进度等显示
}

// ── 云端读写操作 ──────────────────────────────────────────────

/**
 * 推送本地进度到 Supabase（upsert：有则更新，无则插入）
 * 使用节流调用，避免频繁请求耗尽免费额度
 */
async function pushProgress() {
  if (!sb || !userId) return; // 未连接则跳过
  updateSyncUi("同步中…", "syncing"); // 显示同步中状态
  const { error } = await sb.from("progress").upsert({
    user_id: userId, // 行主键：每个用户一行
    data: serializeState(), // JSONB：存储全部进度
    updated_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace("Z", ""),
  });
  updateSyncUi(error ? "同步失败" : "已同步", error ? "error" : "");
}

/**
 * 节流调度：延迟 SYNC_MS 毫秒后执行推送。
 * 在此期间多次调用会重置计时器，确保最后一次变化后 60 秒才真正推送。
 */
function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer); // 取消上一次未执行的推送
  syncTimer = setTimeout(pushProgress, SYNC_MS); // 重新设定 60 秒后执行
}

/**
 * 从 Supabase 拉取远端进度并覆盖本地状态
 * 如果远端无数据（新设备首次连接），则自动推送本地初始状态
 */
async function pullProgress() {
  if (!sb || !userId) return;
  updateSyncUi("拉取中…", "syncing");
  // maybeSingle()：返回单行或 null，避免多行时报错
  const { data, error } = await sb.from("progress").select("data").eq("user_id", userId).maybeSingle();
  if (error) {
    updateSyncUi("拉取失败", "error");
    return;
  }
  if (data?.data) {
    deserializeState(data.data); // 有远端数据 → 覆盖本地
    updateSyncUi("已同步", "");
  } else {
    updateSyncUi("本地无远端进度，已就绪", "");
    await pushProgress(); // 远端无数据 → 推送本地初始状态
  }
}

// ── 初始化入口 ────────────────────────────────────────────────

/**
 * 启动同步流程：
 * 1. 生成或使用已有 userId
 * 2. 创建 Supabase 客户端
 * 3. 切换 UI 到已连接状态
 * 4. 拉取远端数据（有则恢复，无则推送本地）
 * 5. 启动 60 秒节流自动推送
 * @param {string} inputId - 用户输入的旧设备 ID，或空字符串表示新建
 */
async function startSync(inputId) {
  if (inputId) {
    userId = inputId.trim(); // 使用用户提供的 ID（跨设备同步）
  } else {
    userId = crypto.randomUUID(); // 生成新的随机 UUID
  }
  localStorage.setItem("tc_uid", userId); // 持久化到 localStorage，刷新不丢
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); // 初始化客户端
  showConnectedUi(); // 切换 UI：隐藏连接按钮，显示同步按钮和 ID
  await pullProgress(); // 拉取远端（有数据则恢复，无则推送本地）
  scheduleSync(); // 启动节流自动推送
}

// ── 事件绑定 ──────────────────────────────────────────────────

/** 「连接」按钮：已有 ID 则直接连，否则显示输入框让用户选择 */
syncSetupBtn.addEventListener("click", () => {
  if (userId) {
    startSync(userId); // 已有 ID → 直接连接
  } else {
    showNewDeviceUi(); // 无 ID → 显示输入框（粘贴旧 ID 或留空新建）
  }
});

/** 「确认」按钮：确认输入框中的 ID（或留空新建） */
syncIdConfirm.addEventListener("click", () => {
  const val = syncIdInput.value.trim();
  startSync(val); // val 为空则新建，有值则用旧 ID 同步
});

/** 输入框回车键也可以确认 */
syncIdInput.addEventListener("keydown", e => {
  if (e.key === "Enter") syncIdConfirm.click();
});

/** 「同步」按钮：先推再拉，确保本地不丢失 */
syncBtn.addEventListener("click", async () => {
  await pushProgress(); // 第一步：推送本地进度到云端
  await pullProgress(); // 第二步：从云端拉取最新数据覆盖本地
});

/** UUID 显示区域：点击复制到剪贴板，方便发给其他设备 */
syncIdDisplay.addEventListener("click", () => {
  navigator.clipboard.writeText(userId).then(() => {
    updateSyncUi("ID 已复制", "");
    setTimeout(() => updateSyncUi("已同步", ""), 1500); // 1.5 秒后恢复状态文字
  });
});

// ── 自动连接 ──────────────────────────────────────────────────
// 页面加载时如果 localStorage 中已有 userId，自动连接并恢复进度
if (userId) {
  startSync(userId);
}
