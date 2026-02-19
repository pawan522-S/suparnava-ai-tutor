/**
 * app.js — Main SPA router and screen controller
 * Manages: auth flow, screen switching, toast notifications,
 * voice chat logic, lessons, progress dashboard, settings
 */

// ── State ────────────────────────────────────────────────────
const AppState = {
    currentScreen: 'home',
    currentScenario: null,
    chatHistory: [],
    progressData: null,
    lessonsData: [],
    dailyChallenge: null,
};

// ── Toast System ─────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { info: 'ℹ️', success: '✅', error: '❌', xp: '⭐' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || '💬'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration + 300);
}

// ── Screen Router ────────────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const screen = document.getElementById(`screen-${id}`);
    const navItem = document.querySelector(`.nav-item[data-screen="${id}"]`);
    if (screen) screen.classList.add('active');
    if (navItem) navItem.classList.add('active');

    AppState.currentScreen = id;

    // Lazy-load screen data
    if (id === 'progress') loadProgressScreen();
    if (id === 'lessons') loadLessonsScreen();
    if (id === 'home') loadHomeScreen();
    if (id === 'chat') initChatScreen();
}

// ── Auth Guard ───────────────────────────────────────────────
function checkAuth() {
    if (!Auth.isLoggedIn()) {
        showScreen('onboarding');
        document.getElementById('bottom-nav').style.display = 'none';
        return false;
    }
    document.getElementById('bottom-nav').style.display = 'flex';
    return true;
}

// ════════════════════════════════════════════════════════════
// HOME SCREEN
// ════════════════════════════════════════════════════════════
async function loadHomeScreen() {
    const user = Auth.getUser();
    if (!user) return;

    // Update greeting
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const el = document.getElementById('home-greeting');
    if (el) el.textContent = `${greet}, ${user.name?.split(' ')[0] || 'Learner'}! 👋`;

    // Load progress for XP bar and streak
    try {
        const data = await API.getProgress();
        AppState.progressData = data;
        const a = data.analytics;

        const xpEl = document.getElementById('home-xp');
        const stEl = document.getElementById('home-streak');
        const lvEl = document.getElementById('home-level');
        const xpBarEl = document.getElementById('home-xp-bar');
        const xpPct = document.getElementById('home-xp-pct');

        if (xpEl) xpEl.textContent = a.xp.toLocaleString();
        if (stEl) stEl.textContent = a.streak;
        if (lvEl) lvEl.textContent = a.level.charAt(0).toUpperCase() + a.level.slice(1);
        if (xpBarEl) xpBarEl.style.width = `${Math.min(100, a.xpPercent)}%`;
        if (xpPct) xpPct.textContent = `${a.xpPercent}%`;

        // Load daily challenge card
        const chal = await API.getDailyChallenge();
        AppState.dailyChallenge = chal;
        const chalEl = document.getElementById('challenge-prompt');
        if (chalEl) chalEl.textContent = chal.challenge.prompt;

    } catch (err) {
        console.warn('[Home] Could not load progress:', err.message);
    }
}

// ════════════════════════════════════════════════════════════
// ONBOARDING
// ════════════════════════════════════════════════════════════
let onboardStep = 0;
const onboard = { name: '', email: '', password: '', lang: 'Hindi', level: 'beginner' };

function nextOnboardStep(step) {
    // Validate current step
    if (step === 1) {
        onboard.name = document.getElementById('ob-name')?.value.trim();
        onboard.email = document.getElementById('ob-email')?.value.trim();
        onboard.password = document.getElementById('ob-password')?.value;
        if (!onboard.name || !onboard.email || !onboard.password) {
            return showToast('Please fill in all fields.', 'error');
        }
        if (!onboard.email.includes('@')) return showToast('Please enter a valid email.', 'error');
        if (onboard.password.length < 6) return showToast('Password must be 6+ characters.', 'error');
    }
    if (step === 2) {
        onboard.lang = document.querySelector('.lang-btn.selected')?.dataset.lang || 'English';
    }

    document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
    const nextEl = document.getElementById(`ob-step-${step}`);
    if (nextEl) nextEl.classList.add('active');

    // Update dots
    document.querySelectorAll('.slide-dot').forEach((d, i) => {
        d.classList.toggle('active', i === step - 1);
    });
    onboardStep = step;
}

async function completeOnboarding() {
    // Always read fresh from DOM — the inline script overrides nextOnboardStep
    // so the onboard object is never populated by it. Reading from DOM is reliable.
    const name = document.getElementById('ob-name')?.value.trim();
    const email = document.getElementById('ob-email')?.value.trim();
    const password = document.getElementById('ob-password')?.value;
    const lang = document.querySelector('.lang-btn.selected')?.dataset.lang || 'English';
    const level = document.querySelector('.level-card.selected')?.dataset.level || 'beginner';

    // Final safety-net validation
    if (!name || !email || !password) {
        return showToast('Please fill in your name, email and password on the first step.', 'error');
    }

    const btn = document.getElementById('ob-finish-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Creating account...'; }

    try {
        await API.register(name, email, password, lang, level);
        showToast('Welcome aboard! 🎉', 'success');
        document.getElementById('bottom-nav').style.display = 'flex';
        showScreen('home');
        loadHomeScreen();
    } catch (err) {
        showToast(err.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '🎓 Start Learning!'; }
    }
}

async function doLogin() {
    const email = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    if (!email || !password) return showToast('Please enter email and password.', 'error');

    const btn = document.getElementById('login-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>'; }

    try {
        await API.login(email, password);
        showToast('Welcome back! 📚', 'success');
        document.getElementById('bottom-nav').style.display = 'flex';
        showScreen('home');
    } catch (err) {
        showToast(err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
    }
}

// ════════════════════════════════════════════════════════════
// VOICE CHAT SCREEN
// ════════════════════════════════════════════════════════════
let chatCanvas = null;

function initChatScreen() {
    chatCanvas = document.getElementById('waveform-canvas');
    if (chatCanvas) VoiceChat.drawWaveform(chatCanvas, true);

    // Load scenarios into dropdown
    loadScenariosDropdown();
}

async function loadScenariosDropdown() {
    try {
        const data = await API.getScenarios();
        const sel = document.getElementById('scenario-select');
        if (!sel) return;
        sel.innerHTML = '<option value="">💬 Free Conversation</option>';
        data.scenarios.forEach(s => {
            sel.innerHTML += `<option value="${s.id}">${s.icon} ${s.label}</option>`;
        });
    } catch { }
}

async function toggleRecording() {
    const micBtn = document.getElementById('mic-btn');
    const interim = document.getElementById('interim-text');

    // ── Stop if already recording ────────────────────────
    if (VoiceChat.isRecording()) {
        VoiceChat.stopRecording();
        if (micBtn) { micBtn.classList.remove('recording'); micBtn.textContent = '🎤'; }
        if (interim) { interim.textContent = ''; }
        VoiceChat.stopWaveformAnimation(chatCanvas);
        return;
    }

    // ── Browser support check ────────────────────────────
    if (!VoiceChat.supported) {
        return showToast('🚫 Voice not supported. Please use Chrome or Edge browser.', 'error', 5000);
    }

    // ── Update UI to "waiting" state ─────────────────────
    if (micBtn) { micBtn.classList.add('recording'); micBtn.textContent = '⏹'; }
    if (interim) { interim.textContent = '🎤 Listening… speak now'; interim.style.color = 'var(--c-primary-2)'; }
    if (chatCanvas) VoiceChat.startWaveformAnimation(chatCanvas);

    await VoiceChat.startRecording(
        // onInterim — show live transcription
        (text) => {
            if (interim) {
                interim.textContent = text ? `💬 ${text}` : '🎤 Listening… speak now';
                interim.style.color = text ? 'var(--t-heading)' : 'var(--c-primary-2)';
            }
        },

        // onFinal — got the full sentence
        async (finalText) => {
            if (micBtn) { micBtn.classList.remove('recording'); micBtn.textContent = '🎤'; }
            if (interim) { interim.textContent = ''; interim.style.color = ''; }
            VoiceChat.stopWaveformAnimation(chatCanvas);
            if (finalText.trim()) {
                await sendChatMessage(finalText.trim());
            } else {
                showToast('No speech detected — try speaking again.', 'info');
            }
        },

        // onError — show friendly error
        (errMsg) => {
            if (micBtn) { micBtn.classList.remove('recording'); micBtn.textContent = '🎤'; }
            if (interim) { interim.textContent = ''; interim.style.color = ''; }
            VoiceChat.stopWaveformAnimation(chatCanvas);
            if (errMsg) showToast(errMsg, 'error', 6000);
        }
    );
}

async function sendChatMessage(text) {
    if (!text.trim()) return;
    const scenario = document.getElementById('scenario-select')?.value || null;

    // Add user bubble
    addChatBubble(text, 'user');

    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    addChatBubble('...', 'ai', typingId);

    // Disable mic during processing
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) micBtn.disabled = true;

    try {
        const result = await API.chat(text, scenario);

        // Remove typing indicator
        document.getElementById(typingId)?.remove();

        // Show tutor reply
        addChatBubble(result.tutor.reply, 'ai');

        // Speak the reply
        VoiceChat.speak(result.tutor.reply);

        // Show grammar correction panel
        renderGrammarPanel(result.grammar, result.pronunciation);

        // XP toast
        if (result.progress?.xpGained > 0) {
            showToast(`+${result.progress.xpGained} XP earned!`, 'xp');
        }
        if (result.progress?.newBadges?.length > 0) {
            result.progress.newBadges.forEach(b => {
                setTimeout(() => showToast(`${b.icon} Badge unlocked: ${b.title}!`, 'success', 4000), 500);
            });
        }
        if (result.progress?.shouldLevelUp) {
            showToast('🚀 You\'re ready to level up!', 'success', 5000);
        }

    } catch (err) {
        document.getElementById(typingId)?.remove();
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        if (micBtn) micBtn.disabled = false;
    }
}

function addChatBubble(text, role, id = null) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'}`;
    if (id) wrap.id = id;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble bubble-${role}`;
    bubble.textContent = text;
    wrap.appendChild(bubble);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
}

function renderGrammarPanel(grammar, pronunciation) {
    const panel = document.getElementById('grammar-panel');
    if (!panel || !grammar) return;

    panel.classList.remove('hidden');

    const scoreEl = document.getElementById('grammar-score');
    const errList = document.getElementById('grammar-errors');
    const corrEl = document.getElementById('grammar-corrected');
    const pronEl = document.getElementById('pron-score');

    if (scoreEl) scoreEl.textContent = grammar.overallScore ?? '—';
    if (corrEl) corrEl.textContent = grammar.correctedText || '';
    if (pronEl && pronunciation) pronEl.textContent = pronunciation.score ?? '—';

    if (errList) {
        errList.innerHTML = '';
        if (!grammar.errors || grammar.errors.length === 0) {
            errList.innerHTML = '<p class="text-sm" style="color:var(--c-success)">✅ Perfect sentence! No errors found.</p>';
        } else {
            grammar.errors.slice(0, 4).forEach(err => {
                const item = document.createElement('div');
                item.className = 'correction-error mt-2';
                item.innerHTML = `
                    <div class="flex items-center gap-2 mb-2">
                      <span class="badge-chip badge-warning">${err.type}</span>
                      <span class="text-xs text-muted">"${err.original}" → "${err.corrected}"</span>
                    </div>
                    <p class="text-sm" style="color:var(--t-body)">${err.explanation}</p>
                `;
                errList.appendChild(item);
            });
        }
    }
}

function sendTextInput() {
    const inp = document.getElementById('text-input');
    if (!inp || !inp.value.trim()) return;
    sendChatMessage(inp.value.trim());
    inp.value = '';
}

function clearChatHistory() {
    const container = document.getElementById('chat-messages');
    if (container) container.innerHTML = '';
    VoiceChat.stopSpeaking();
    showToast('Conversation cleared.', 'info');
}

// ════════════════════════════════════════════════════════════
// LESSONS SCREEN
// ════════════════════════════════════════════════════════════
async function loadLessonsScreen() {
    const grid = document.getElementById('lessons-grid');
    if (!grid) return;

    grid.innerHTML = '<p class="text-center text-muted" style="padding:24px">Loading lessons...</p>';

    try {
        const data = await API.getLessons();
        AppState.lessonsData = data.lessons;
        grid.innerHTML = '';

        const completed = data.stats?.completed || 0;
        const total = data.stats?.total || 0;
        const progEl = document.getElementById('lesson-progress-text');
        if (progEl) progEl.textContent = `${completed}/${total} completed`;

        const barEl = document.getElementById('lesson-progress-bar');
        if (barEl && total > 0) barEl.style.width = `${Math.round((completed / total) * 100)}%`;

        data.lessons.forEach(lesson => {
            const card = document.createElement('div');
            card.className = `lesson-card card ${lesson.completed ? 'completed' : ''}`;
            card.innerHTML = `
              <div class="card-body">
                <div class="flex items-center gap-3 mb-3">
                  <div style="font-size:2rem;position:relative" class="lesson-icon">
                    ${lesson.icon || '📚'}
                    ${lesson.completed ? '<span style="position:absolute;inset:0;background:rgba(52,211,153,0.85);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:700;color:#fff">✓</span>' : ''}
                  </div>
                  <div class="flex-1">
                    <h4 style="color:var(--t-heading)">${lesson.title}</h4>
                    <p class="text-xs text-muted">${lesson.duration || 10} min · ${lesson.xp || 50} XP</p>
                  </div>
                </div>
                <p class="text-sm text-muted">${lesson.objective || ''}</p>
                <div class="flex items-center justify-between mt-3">
                  <span class="badge-chip badge-primary">${(lesson.focusArea || lesson.level || 'general').replace(/_/g, ' ')}</span>
                  <button onclick="startLesson('${lesson.id}')" class="btn btn-sm ${lesson.completed ? 'btn-secondary' : 'btn-primary'}">
                    ${lesson.completed ? 'Review' : 'Start →'}
                  </button>
                </div>
              </div>`;
            grid.appendChild(card);
        });
    } catch (err) {
        grid.innerHTML = `<p class="text-center text-muted" style="padding:24px">Could not load lessons. ${err.message}</p>`;
    }
}

async function startLesson(lessonId) {
    const lesson = AppState.lessonsData.find(l => l.id === lessonId);
    if (!lesson) return;

    const modal = document.getElementById('lesson-modal');
    const title = document.getElementById('lesson-modal-title');
    const obj = document.getElementById('lesson-modal-obj');
    const exList = document.getElementById('lesson-exercises');

    if (title) title.textContent = `${lesson.icon || '📚'} ${lesson.title}`;
    if (obj) obj.textContent = lesson.objective || '';
    if (exList) {
        exList.innerHTML = '';
        (lesson.exercises || []).forEach((ex, i) => {
            const item = document.createElement('div');
            item.className = 'card card-body mb-3';
            item.innerHTML = `
              <p class="text-sm font-semibold mb-2" style="color:var(--c-primary-2)">Exercise ${i + 1}</p>
              <p class="text-sm">${ex.prompt}</p>
              <span class="badge-chip badge-primary mt-2">${ex.type.replace(/_/g, ' ')}</span>`;
            exList.appendChild(item);
        });
    }

    if (modal) modal.classList.remove('hidden');
    document.getElementById('lesson-modal-id').dataset.lessonId = lessonId;
}

async function completeCurrentLesson() {
    const lessonId = document.getElementById('lesson-modal-id')?.dataset.lessonId;
    const btn = document.getElementById('lesson-complete-btn');
    if (!lessonId) return;

    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>'; }
    try {
        const res = await API.completeLesson(lessonId);
        closeLessonModal();
        showToast(`Lesson complete! +${res.xpGained} XP 🎉`, 'success', 4000);
        loadLessonsScreen();
    } catch (err) {
        showToast(err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Mark Complete'; }
    }
}

function closeLessonModal() {
    const modal = document.getElementById('lesson-modal');
    if (modal) modal.classList.add('hidden');
}

// ════════════════════════════════════════════════════════════
// PROGRESS SCREEN
// ════════════════════════════════════════════════════════════
async function loadProgressScreen() {
    const loadingEl = document.getElementById('progress-loading');
    if (loadingEl) loadingEl.classList.remove('hidden');

    try {
        const data = await API.getProgress();
        AppState.progressData = data;
        const a = data.analytics;
        if (loadingEl) loadingEl.classList.add('hidden');

        // Stats
        setText('prog-accuracy', `${a.accuracy}%`);
        setText('prog-streak', `${a.streak}🔥`);
        setText('prog-messages', a.messageCount);
        setText('prog-xp', a.xp.toLocaleString());
        setText('prog-level', a.level.charAt(0).toUpperCase() + a.level.slice(1));
        setText('prog-lessons', a.lessonsCompleted);
        setText('prog-badges', a.badgeCount);
        setText('prog-scenarios', a.scenariosCount);

        // XP bar
        const xpBar = document.getElementById('prog-xp-bar');
        if (xpBar) xpBar.style.width = `${Math.min(100, a.xpPercent)}%`;

        // Focus tip
        if (data.personalization?.focusTip) {
            const tipEl = document.getElementById('focus-tip');
            if (tipEl) tipEl.textContent = data.personalization.focusTip;
        }

        // Charts
        const lineCanvas = document.getElementById('chart-accuracy');
        if (lineCanvas) Charts.drawLineChart(lineCanvas, a.recentSessions);

        const barCanvas = document.getElementById('chart-weekly');
        if (barCanvas) Charts.drawBarChart(barCanvas, a.weeklyActivity);

        const donutCanvas = document.getElementById('chart-errors');
        if (donutCanvas) Charts.drawDonutChart(donutCanvas, a.errorBreakdown);

        // Badges
        renderBadges(a.earnedBadges);

    } catch (err) {
        if (loadingEl) loadingEl.classList.add('hidden');
        showToast('Could not load progress: ' + err.message, 'error');
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function renderBadges(badges) {
    const grid = document.getElementById('badges-grid');
    if (!grid) return;
    grid.innerHTML = '';
    if (!badges || badges.length === 0) {
        grid.innerHTML = '<p class="text-sm text-muted">Complete sessions to earn badges!</p>';
        return;
    }
    badges.forEach(b => {
        const el = document.createElement('div');
        el.className = 'glass-card p5 text-center';
        el.style.cssText = 'padding:12px;cursor:default;';
        el.title = b.description;
        el.innerHTML = `<div style="font-size:1.8rem">${b.icon}</div><div class="text-xs font-semibold mt-2" style="color:var(--t-heading)">${b.title}</div>`;
        grid.appendChild(el);
    });
}

// ════════════════════════════════════════════════════════════
// SETTINGS SCREEN
// ════════════════════════════════════════════════════════════
function loadSettingsScreen() {
    const user = Auth.getUser();
    if (!user) return;
    const nameEl = document.getElementById('settings-name');
    const emailEl = document.getElementById('settings-email');
    if (nameEl) nameEl.value = user.name || '';
    if (emailEl) emailEl.value = user.email || '';
}

async function saveSettings() {
    const name = document.getElementById('settings-name')?.value.trim();
    const level = document.getElementById('settings-level')?.value;
    const btn = document.getElementById('settings-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>'; }
    try {
        const res = await API.updateProfile({ name, level });
        Auth.setUser(res.user);
        showToast('Settings saved!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    }
}

function doLogout() {
    Auth.clearToken();
    AppState.chatHistory = [];
    document.getElementById('bottom-nav').style.display = 'none';
    showScreen('onboarding');
    nextOnboardStep(1);
    showToast('Signed out. See you soon!', 'info');
}

// ════════════════════════════════════════════════════════════
// DAILY CHALLENGE
// ════════════════════════════════════════════════════════════
async function submitDailyChallenge() {
    if (!AppState.dailyChallenge) return;
    const response = document.getElementById('challenge-response')?.value.trim();
    if (!response) return showToast('Please write or speak your response first.', 'error');

    const btn = document.getElementById('challenge-submit-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Evaluating...'; }
    try {
        const result = await API.submitChallenge(AppState.dailyChallenge.challenge.id, response);
        document.getElementById('challenge-feedback').textContent = result.feedback;
        document.getElementById('challenge-result').classList.remove('hidden');
        showToast(`Challenge complete! +${result.xpGained} XP 🏆`, 'xp', 4000);
        if (btn) btn.classList.add('hidden');
    } catch (err) {
        showToast(err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Submit Response'; }
    }
}

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════
window.addEventListener('auth:expired', () => {
    showToast('Session expired. Please sign in again.', 'error', 5000);
    doLogout();
});

window.addEventListener('DOMContentLoaded', () => {
    if (Auth.isLoggedIn()) {
        document.getElementById('bottom-nav').style.display = 'flex';
        showScreen('home');
    } else {
        document.getElementById('bottom-nav').style.display = 'none';
        showScreen('onboarding');
    }

    // Resize charts on canvas visibility
    const resizeObs = new ResizeObserver(() => {
        if (AppState.currentScreen === 'progress' && AppState.progressData) {
            const a = AppState.progressData.analytics;
            const lc = document.getElementById('chart-accuracy');
            const bc = document.getElementById('chart-weekly');
            const dc = document.getElementById('chart-errors');
            if (lc) Charts.drawLineChart(lc, a.recentSessions);
            if (bc) Charts.drawBarChart(bc, a.weeklyActivity);
            if (dc) Charts.drawDonutChart(dc, a.errorBreakdown);
        }
    });
    const progressScreen = document.getElementById('screen-progress');
    if (progressScreen) resizeObs.observe(progressScreen);
});

// ── Expose globals for HTML onclick handlers ──
window.showScreen = showScreen;
window.nextOnboardStep = nextOnboardStep;
window.completeOnboarding = completeOnboarding;
window.doLogin = doLogin;
window.doLogout = doLogout;
window.toggleRecording = toggleRecording;
window.sendTextInput = sendTextInput;
window.clearChatHistory = clearChatHistory;
window.loadLessonsScreen = loadLessonsScreen;
window.startLesson = startLesson;
window.completeCurrentLesson = completeCurrentLesson;
window.closeLessonModal = closeLessonModal;
window.loadProgressScreen = loadProgressScreen;
window.loadSettingsScreen = loadSettingsScreen;
window.saveSettings = saveSettings;
window.submitDailyChallenge = submitDailyChallenge;
