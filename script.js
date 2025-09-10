// Utilities
const $ = (sel, parent = document) => parent.querySelector(sel);
const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));

// Elements
const toggleIngredientsBtn = $('#toggle-ingredients');
const toggleStepsBtn = $('#toggle-steps');
const ingredientsSection = $('.ingredients');
const stepsSection = $('.steps');
const stepsList = $('#steps-list');
let stepsItems = $$('#steps-list li');
const stepChecks = $$('.step-check');
const progressBar = $('#progress-bar');
const startBtn = $('#start-btn');
const nextBtn = $('#next-btn');
const resetBtn = $('#reset-btn');
const timerDisplay = $('#timer-display');
const servingsInput = $('#servings');
const servingsDec = $('#servings-decrease');
const servingsInc = $('#servings-increase');
const printBtn = $('#print-btn');
const ingredientsList = $('#ingredients-list');
const ttsToggle = $('#tts-enabled');

// State
let currentStepIndex = -1; // none selected
let timerIntervalId = null;
let timerStartEpochMs = null;
let timerPausedElapsedMs = 0;
let timerRunning = false;
const STORAGE_KEY = 'recipe_card_state_v1';
const baseServings = 4;

// Collapsible toggles
toggleIngredientsBtn?.addEventListener('click', () => {
  ingredientsSection?.classList.toggle('hidden');
});

toggleStepsBtn?.addEventListener('click', () => {
  stepsSection?.classList.toggle('hidden');
  persistState();
});

// Servings controls and ingredient scaling
function scaleIngredients() {
  const targetServings = Math.max(1, parseInt(servingsInput.value || baseServings, 10));
  const scale = targetServings / baseServings;
  $$('#ingredients-list li').forEach((li) => {
    const base = Number(li.getAttribute('data-base'));
    if (!isNaN(base)) {
      const unitText = li.textContent.replace(/^[\d./\s]+/, '');
      const scaled = base * scale;
      const display = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(2).replace(/\.00$/, '');
      li.firstChild.textContent = `${display} ${unitText}`;
    }
  });
  persistState();
}

servingsInput?.addEventListener('change', () => {
  if (servingsInput.value === '' || Number(servingsInput.value) < 1) {
    servingsInput.value = '1';
  }
  scaleIngredients();
});
servingsDec?.addEventListener('click', () => {
  servingsInput.value = String(Math.max(1, (parseInt(servingsInput.value, 10) || baseServings) - 1));
  scaleIngredients();
});
servingsInc?.addEventListener('click', () => {
  servingsInput.value = String((parseInt(servingsInput.value, 10) || baseServings) + 1);
  scaleIngredients();
});

// Print
printBtn?.addEventListener('click', () => window.print());

// Timer helpers
function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function startTimer() {
  if (timerIntervalId) return;
  if (!timerRunning) {
    timerStartEpochMs = Date.now();
    timerRunning = true;
  }
  timerIntervalId = setInterval(() => {
    const elapsed = (Date.now() - timerStartEpochMs) + timerPausedElapsedMs;
    timerDisplay.textContent = formatDuration(elapsed);
  }, 250);
  persistState();
}

function resetTimer() {
  clearInterval(timerIntervalId);
  timerIntervalId = null;
  timerStartEpochMs = null;
  timerPausedElapsedMs = 0;
  timerRunning = false;
  timerDisplay.textContent = '00:00';
  persistState();
}

function pauseTimer() {
  if (!timerRunning) return;
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  if (timerStartEpochMs) {
    timerPausedElapsedMs += Date.now() - timerStartEpochMs;
    timerStartEpochMs = null;
  }
  timerRunning = false;
  persistState();
}

// Step progression
function setActiveStep(index, { speak = true } = {}) {
  stepsItems.forEach((li, i) => {
    const check = li.querySelector('.step-check');
    const completed = check?.checked || i < index;
    li.classList.toggle('active', i === index);
    li.classList.toggle('completed', !!completed);
  });
  const completedCount = stepChecks.filter(c => c.checked).length;
  const pct = stepsItems.length ? Math.round((completedCount / stepsItems.length) * 100) : 0;
  progressBar.style.width = `${pct}%`;
  if (speak) speakCurrentStep();
  vibrate(15);
  persistState();
}

function disableControls(isDisabled) {
  nextBtn.disabled = isDisabled;
  resetBtn.disabled = isDisabled;
}

function beginCookingFlow() {
  currentStepIndex = 0;
  setActiveStep(currentStepIndex);
  startBtn.disabled = true;
  disableControls(false);
  startTimer();
}

function nextStep() {
  if (currentStepIndex < 0) return beginCookingFlow();
  const currentLi = stepsItems[currentStepIndex];
  const currentCheck = currentLi?.querySelector('.step-check');
  if (currentCheck && !currentCheck.checked) currentCheck.checked = true;
  if (currentStepIndex < stepsItems.length - 1) {
    currentStepIndex += 1;
    setActiveStep(currentStepIndex);
  } else {
    setActiveStep(currentStepIndex);
    nextBtn.disabled = true;
    startBtn.disabled = false;
    pauseTimer();
  }
}

function resetFlow() {
  currentStepIndex = -1;
  setActiveStep(currentStepIndex);
  startBtn.disabled = false;
  nextBtn.disabled = true;
  resetBtn.disabled = true;
  resetTimer();
  stepsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

startBtn?.addEventListener('click', beginCookingFlow);
nextBtn?.addEventListener('click', nextStep);
resetBtn?.addEventListener('click', resetFlow);

// Step checkbox handlers (auto-progress)
stepChecks.forEach((check, index) => {
  check.addEventListener('change', () => {
    if (check.checked) {
      currentStepIndex = Math.max(currentStepIndex, index);
      setActiveStep(currentStepIndex, { speak: true });
      // auto-advance focus to next unchecked step
      const nextUnchecked = stepChecks.findIndex((c, i) => i > index && !c.checked);
      if (nextUnchecked !== -1) {
        currentStepIndex = nextUnchecked;
        setActiveStep(currentStepIndex, { speak: true });
      } else {
        nextBtn.disabled = true;
        startBtn.disabled = false;
        pauseTimer();
      }
    } else {
      // Unchecking moves active back to this step
      currentStepIndex = index;
      setActiveStep(currentStepIndex, { speak: false });
      nextBtn.disabled = false;
    }
  });
});

// Voice guidance (TTS)
function speak(text) {
  try {
    if (!ttsToggle?.checked) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    utter.pitch = 1.0;
    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
  } catch (_) { /* no-op */ }
}

function speakCurrentStep() {
  const li = stepsItems[currentStepIndex];
  if (!li) return;
  const text = li.querySelector('.step-text')?.textContent?.trim();
  if (text) speak(text);
}

ttsToggle?.addEventListener('change', persistState);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  const tag = (e.target && (e.target.tagName || '')).toLowerCase();
  if (tag === 'input' || tag === 'textarea') return; // avoid typing conflicts
  if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); nextStep(); }
  if (e.key.toLowerCase() === 'n') { nextStep(); }
  if (e.key.toLowerCase() === 'r') { resetFlow(); }
  if (e.key.toLowerCase() === 'i') { toggleIngredientsBtn?.click(); }
  if (e.key.toLowerCase() === 's') { toggleStepsBtn?.click(); }
});

// Haptics
function vibrate(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) { /* no-op */ }
}

// Persistence
function persistState() {
  const state = {
    servings: parseInt(servingsInput.value || baseServings, 10),
    ingredientsHidden: ingredientsSection?.classList.contains('hidden') || false,
    stepsHidden: stepsSection?.classList.contains('hidden') || false,
    tts: !!ttsToggle?.checked,
    checks: stepChecks.map(c => c.checked),
    currentStepIndex,
    timer: {
      running: !!timerIntervalId,
      startEpoch: timerStartEpochMs,
      pausedElapsed: timerPausedElapsedMs,
      display: timerDisplay.textContent
    }
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
}

function restoreState() {
  let state = null;
  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { state = null; }
  if (!state) return;
  if (state.servings) { servingsInput.value = String(state.servings); scaleIngredients(); }
  if (state.ingredientsHidden) ingredientsSection?.classList.add('hidden');
  if (state.stepsHidden) stepsSection?.classList.add('hidden');
  if (ttsToggle) ttsToggle.checked = !!state.tts;
  if (Array.isArray(state.checks)) {
    state.checks.forEach((val, i) => { if (stepChecks[i]) stepChecks[i].checked = !!val; });
  }
  currentStepIndex = typeof state.currentStepIndex === 'number' ? state.currentStepIndex : -1;
  setActiveStep(currentStepIndex, { speak: false });
  // Timer restore
  timerPausedElapsedMs = Number(state?.timer?.pausedElapsed || 0);
  timerDisplay.textContent = state?.timer?.display || '00:00';
  if (state?.timer?.running && typeof state?.timer?.startEpoch === 'number') {
    timerStartEpochMs = state.timer.startEpoch;
    startTimer();
  }
}

// Init
scaleIngredients();
disableControls(true);
setActiveStep(-1, { speak: false });
restoreState();


