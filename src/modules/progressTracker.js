/**
 * Enhanced Progress Tracker
 *
 * Extends the existing userProgress.js with:
 * - XP (experience points) system
 * - Badge/achievement system
 * - Detailed session logs
 * - Comprehensive analytics
 * - Streak validation with timezone awareness
 */

const { fileDB } = require('../database/db');
const { randomUUID } = require('crypto');

// ─────────────────────────────────────────────
// XP Reward Table
// ─────────────────────────────────────────────
const XP_REWARDS = {
    message_sent: 5,
    correct_sentence: 15,
    lesson_complete: 50,
    challenge_complete: 75,
    perfect_score: 30,   // grammar score 100
    daily_streak: 20,   // awarded each day
    level_up_bonus: 200,
};

// ─────────────────────────────────────────────
// Badge Definitions
// ─────────────────────────────────────────────
const BADGES = [
    { id: 'first_message', icon: '🎉', title: 'First Step', description: 'Sent your first message to the tutor', condition: p => p.messageCount >= 1 },
    { id: 'streak_3', icon: '🔥', title: '3-Day Streak', description: 'Practiced 3 days in a row', condition: p => p.streak >= 3 },
    { id: 'streak_7', icon: '⚡', title: 'Week Warrior', description: 'Practiced 7 days in a row', condition: p => p.streak >= 7 },
    { id: 'streak_30', icon: '🏆', title: 'Monthly Master', description: 'Practiced 30 days in a row', condition: p => p.streak >= 30 },
    { id: 'messages_10', icon: '💬', title: 'Chatterbox', description: 'Sent 10+ messages', condition: p => p.messageCount >= 10 },
    { id: 'messages_50', icon: '🗣️', title: 'Conversationalist', description: 'Sent 50+ messages', condition: p => p.messageCount >= 50 },
    { id: 'messages_100', icon: '📢', title: 'English Speaker', description: 'Sent 100+ messages', condition: p => p.messageCount >= 100 },
    { id: 'accuracy_70', icon: '🎯', title: 'Sharpshooter', description: 'Achieved 70%+ accuracy over 20+ messages', condition: p => p.messageCount >= 20 && (p.totalCorrect / (p.totalCorrect + p.totalErrors || 1)) >= 0.70 },
    { id: 'accuracy_90', icon: '🌟', title: 'Grammar Star', description: 'Achieved 90%+ accuracy over 30+ messages', condition: p => p.messageCount >= 30 && (p.totalCorrect / (p.totalCorrect + p.totalErrors || 1)) >= 0.90 },
    { id: 'xp_500', icon: '💎', title: 'Explorer', description: 'Earned 500+ XP', condition: p => (p.xp || 0) >= 500 },
    { id: 'xp_2000', icon: '👑', title: 'Champion', description: 'Earned 2000+ XP', condition: p => (p.xp || 0) >= 2000 },
    { id: 'level_intermediate', icon: '📈', title: 'Level Up!', description: 'Reached Intermediate level', condition: p => p.level === 'intermediate' || p.level === 'advanced' },
    { id: 'level_advanced', icon: '🚀', title: 'Advanced Learner', description: 'Reached Advanced level', condition: p => p.level === 'advanced' },
    { id: 'lesson_5', icon: '📚', title: 'Bookworm', description: 'Completed 5 lessons', condition: p => (p.lessonsCompleted || 0) >= 5 },
    { id: 'lesson_20', icon: '🎓', title: 'Scholar', description: 'Completed 20 lessons', condition: p => (p.lessonsCompleted || 0) >= 20 },
    { id: 'perfect_grammar', icon: '✨', title: 'Perfect Sentence', description: 'Received a perfect grammar score', condition: p => (p.perfectScores || 0) >= 1 },
    { id: 'scenario_3', icon: '🌍', title: 'World Traveler', description: 'Practiced 3 different scenarios', condition: p => new Set(p.scenarioHistory || []).size >= 3 },
];

/**
 * Default user profile schema (extended version)
 */
function createDefaultProfile(userId) {
    return {
        userId,                     // UUID or phone number
        name: '',
        email: '',
        level: 'beginner',
        nativeLanguage: 'English',
        messageCount: 0,
        correctStreak: 0,
        totalCorrect: 0,
        totalErrors: 0,
        commonErrors: [],           // array of error type strings
        topicsPracticed: [],
        scenarioHistory: [],        // scenario IDs practiced
        hindiMode: false,
        xp: 0,
        badges: [],                 // array of badge IDs earned
        lessonsCompleted: 0,
        completedLessonIds: [],
        perfectScores: 0,
        streak: 0,
        lastStreakDate: null,
        createdAt: new Date().toISOString(),
        lastInteraction: null,
        sessionLogs: [],            // last 50 sessions
    };
}

/**
 * Load a user profile by ID
 */
function loadProfile(userId) {
    const stored = fileDB.load('profile', userId);
    if (stored) return stored;
    return createDefaultProfile(userId);
}

/**
 * Save a user profile
 */
function saveProfile(profile) {
    return fileDB.save('profile', profile.userId, profile);
}

/**
 * Award XP and check for new badges.
 * @param {object} profile - Mutable profile object
 * @param {string} event   - Key from XP_REWARDS
 * @returns {{ xpGained: number, newBadges: object[] }}
 */
function awardXP(profile, event) {
    const xpGained = XP_REWARDS[event] || 0;
    profile.xp = (profile.xp || 0) + xpGained;

    // Check for newly unlocked badges
    const newBadges = [];
    for (const badge of BADGES) {
        if (!profile.badges.includes(badge.id) && badge.condition(profile)) {
            profile.badges.push(badge.id);
            newBadges.push(badge);
        }
    }

    return { xpGained, newBadges };
}

/**
 * Update streak (timezone-safe).
 * @param {object} profile - Mutable profile object
 * @returns {boolean} Whether a new day was counted
 */
function updateStreak(profile) {
    const todayStr = new Date().toISOString().split('T')[0];
    if (profile.lastStreakDate === todayStr) return false; // already counted today

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
    if (profile.lastStreakDate === yesterday) {
        profile.streak += 1;
    } else {
        profile.streak = 1; // reset broken streak
    }
    profile.lastStreakDate = todayStr;
    return true;
}

/**
 * Auto-calculate level based on progress metrics.
 */
function calculateLevel(profile) {
    const { messageCount, correctStreak, totalCorrect, totalErrors } = profile;
    const accuracy = (totalCorrect + totalErrors) > 0
        ? totalCorrect / (totalCorrect + totalErrors) : 0;

    if (messageCount >= 100 && accuracy >= 0.80 && correctStreak >= 10) return 'advanced';
    if (messageCount >= 30 && accuracy >= 0.65 && correctStreak >= 5) return 'intermediate';
    return 'beginner';
}

/**
 * Record a session after a tutor interaction.
 * @param {string} userId
 * @param {object} sessionData - { hadErrors, errorTypes, topic, grammarScore, userText }
 * @returns {{ profile, xpGained, newBadges }}
 */
function recordSession(userId, sessionData = {}) {
    const profile = loadProfile(userId);

    // ── Counters ──
    profile.messageCount += 1;

    if (sessionData.hadErrors) {
        profile.totalErrors += 1;
        profile.correctStreak = 0;
        const types = sessionData.errorTypes || [];
        for (const t of types) {
            if (!profile.commonErrors.includes(t)) profile.commonErrors.push(t);
        }
        // Keep only the 15 most recent error types
        if (profile.commonErrors.length > 15) profile.commonErrors.splice(0, profile.commonErrors.length - 15);
    } else {
        profile.totalCorrect += 1;
        profile.correctStreak += 1;
    }

    if (sessionData.grammarScore === 100) {
        profile.perfectScores = (profile.perfectScores || 0) + 1;
    }

    // ── Topic tracking ──
    if (sessionData.topic && !profile.topicsPracticed.includes(sessionData.topic)) {
        profile.topicsPracticed.push(sessionData.topic);
        if (profile.topicsPracticed.length > 20) profile.topicsPracticed.shift();
    }

    // ── Scenario tracking ──
    if (sessionData.scenario) {
        profile.scenarioHistory = profile.scenarioHistory || [];
        if (!profile.scenarioHistory.includes(sessionData.scenario)) {
            profile.scenarioHistory.push(sessionData.scenario);
        }
    }

    // ── Session log ──
    const sessionEntry = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        userText: sessionData.userText || '',
        grammarScore: sessionData.grammarScore || null,
        errors: sessionData.errorTypes || [],
        topic: sessionData.topic || 'general',
        scenario: sessionData.scenario || null,
    };
    profile.sessionLogs = profile.sessionLogs || [];
    profile.sessionLogs.push(sessionEntry);
    if (profile.sessionLogs.length > 50) profile.sessionLogs.shift();

    // ── Streak ──
    const isNewDay = updateStreak(profile);

    // ── Level ──
    profile.level = calculateLevel(profile);

    // ── XP ──
    const { xpGained: xp1, newBadges: b1 } = awardXP(profile, 'message_sent');
    const { xpGained: xp2, newBadges: b2 } = sessionData.hadErrors ? { xpGained: 0, newBadges: [] } : awardXP(profile, 'correct_sentence');
    const { xpGained: xp3, newBadges: b3 } = sessionData.grammarScore === 100 ? awardXP(profile, 'perfect_score') : { xpGained: 0, newBadges: [] };
    const { xpGained: xp4, newBadges: b4 } = isNewDay ? awardXP(profile, 'daily_streak') : { xpGained: 0, newBadges: [] };

    // ── Save ──
    profile.lastInteraction = new Date().toISOString();
    saveProfile(profile);

    return {
        profile,
        xpGained: xp1 + xp2 + xp3 + xp4,
        newBadges: [...b1, ...b2, ...b3, ...b4],
    };
}

/**
 * Record a completed lesson.
 */
function recordLessonComplete(userId, lessonId, xpReward = 50) {
    const profile = loadProfile(userId);
    if (!profile.completedLessonIds.includes(lessonId)) {
        profile.completedLessonIds.push(lessonId);
        profile.lessonsCompleted = (profile.lessonsCompleted || 0) + 1;
    }
    const { xpGained, newBadges } = awardXP(profile, 'lesson_complete');
    profile.xp += xpReward - XP_REWARDS.lesson_complete; // apply custom reward if different
    saveProfile(profile);
    return { profile, xpGained: xpReward, newBadges };
}

/**
 * Get a rich analytics summary object.
 */
function getAnalytics(userId) {
    const profile = loadProfile(userId);
    const total = profile.totalCorrect + profile.totalErrors;
    const accuracy = total > 0 ? Math.round((profile.totalCorrect / total) * 100) : 0;

    // Weekly activity (last 7 days)
    const weeklyActivity = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.now() - i * 86_400_000).toISOString().split('T')[0];
        const count = (profile.sessionLogs || []).filter(s => s.timestamp.startsWith(date)).length;
        weeklyActivity.push({ date, count });
    }

    // Error frequency breakdown
    const errorBreakdown = {};
    for (const err of (profile.commonErrors || [])) {
        errorBreakdown[err] = (errorBreakdown[err] || 0) + 1;
    }

    // XP to next level thresholds
    const XP_THRESHOLDS = { beginner: 500, intermediate: 2000, advanced: 5000 };
    const xpNextLevel = XP_THRESHOLDS[profile.level] || 500;

    // Recent session accuracy trend (last 10 sessions)
    const recentSessions = (profile.sessionLogs || []).slice(-10).map(s => ({
        date: s.timestamp.split('T')[0],
        score: s.grammarScore,
    }));

    // Earned badges with full metadata
    const earnedBadges = BADGES.filter(b => (profile.badges || []).includes(b.id)).map(({ condition: _, ...b }) => b);

    return {
        level: profile.level,
        xp: profile.xp || 0,
        xpNextLevel,
        xpPercent: Math.round(((profile.xp || 0) / xpNextLevel) * 100),
        streak: profile.streak || 0,
        messageCount: profile.messageCount,
        accuracy,
        correctStreak: profile.correctStreak,
        lessonsCompleted: profile.lessonsCompleted || 0,
        scenariosCount: new Set(profile.scenarioHistory || []).size,
        badgeCount: (profile.badges || []).length,
        earnedBadges,
        weeklyActivity,
        errorBreakdown,
        recentSessions,
        topicsPracticed: profile.topicsPracticed || [],
    };
}

module.exports = {
    loadProfile, saveProfile, createDefaultProfile,
    recordSession, recordLessonComplete,
    getAnalytics, awardXP, BADGES,
};
