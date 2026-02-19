/**
 * api.js — REST API client with JWT injection and offline fallback
 */

const API_BASE = window.location.origin;

// ── Auth token management ──────────────────────────────────
const Auth = {
    getToken() { return localStorage.getItem('sat_token'); },
    setToken(t) { localStorage.setItem('sat_token', t); },
    clearToken() { localStorage.removeItem('sat_token'); localStorage.removeItem('sat_user'); },
    getUser() { try { return JSON.parse(localStorage.getItem('sat_user')); } catch { return null; } },
    setUser(u) { localStorage.setItem('sat_user', JSON.stringify(u)); },
    isLoggedIn() { return !!this.getToken(); },
};

// ── Core fetch wrapper ─────────────────────────────────────
async function apiFetch(path, options = {}) {
    const token = Auth.getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
    };

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
    });

    let data;
    try { data = await res.json(); }
    catch { data = { error: 'Invalid server response' }; }

    if (!res.ok) {
        // Expired token — force logout
        if (res.status === 401) {
            Auth.clearToken();
            window.dispatchEvent(new Event('auth:expired'));
        }
        throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
}

// ── Auth API ───────────────────────────────────────────────
const api = {
    async register(name, email, password, nativeLanguage, level) {
        const data = await apiFetch('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password, nativeLanguage, level }),
        });
        if (data.token) { Auth.setToken(data.token); Auth.setUser(data.user); }
        return data;
    },

    async login(email, password) {
        const data = await apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        if (data.token) { Auth.setToken(data.token); Auth.setUser(data.user); }
        return data;
    },

    async me() {
        return apiFetch('/api/auth/me');
    },

    async updateProfile(updates) {
        return apiFetch('/api/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(updates),
        });
    },

    // ── Tutor ──
    async chat(text, scenario = null, referenceText = null) {
        return apiFetch('/api/tutor/chat', {
            method: 'POST',
            body: JSON.stringify({ text, scenario, referenceText }),
        });
    },

    async analyze(text, referenceText = null) {
        return apiFetch('/api/tutor/analyze', {
            method: 'POST',
            body: JSON.stringify({ text, referenceText }),
        });
    },

    // ── Lessons ──
    async getLessons() {
        return apiFetch('/api/lessons');
    },

    async completeLesson(lessonId, xpOverride) {
        return apiFetch('/api/lessons/complete', {
            method: 'POST',
            body: JSON.stringify({ lessonId, xpOverride }),
        });
    },

    // ── Progress ──
    async getProgress() {
        return apiFetch('/api/progress');
    },

    async getHistory(limit = 20) {
        return apiFetch(`/api/progress/history?limit=${limit}`);
    },

    // ── Challenges ──
    async getDailyChallenge() {
        return apiFetch('/api/challenges/daily');
    },

    async submitChallenge(challengeId, response) {
        return apiFetch('/api/challenges/submit', {
            method: 'POST',
            body: JSON.stringify({ challengeId, response }),
        });
    },

    // ── Scenarios ──
    async getScenarios() {
        return apiFetch('/api/scenarios');
    },

    async startScenario(scenarioId) {
        return apiFetch('/api/scenarios/start', {
            method: 'POST',
            body: JSON.stringify({ scenarioId }),
        });
    },

    // ── Health ──
    async health() {
        return apiFetch('/api/health');
    },
};

// ── Export as global ──
window.API = api;
window.Auth = Auth;
