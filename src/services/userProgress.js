const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'user_data');

// Ensure user data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Default user profile
 */
function createDefaultProfile(phoneNumber) {
    return {
        phoneNumber,
        level: 'beginner',           // beginner | intermediate | advanced
        messageCount: 0,
        correctStreak: 0,            // Consecutive correct messages
        totalCorrect: 0,
        totalErrors: 0,
        commonErrors: [],            // Track recurring error types
        topicsPracticed: [],         // Topics the user has practiced
        hindiMode: false,            // Whether Hindi explanations are enabled
        lastInteraction: null,
        createdAt: new Date().toISOString(),
        dailyTaskGiven: null,        // Date of last daily task
        streak: 0,                   // Days in a row of practice
        lastStreakDate: null,
    };
}

/**
 * Get the file path for a user's profile
 */
function getProfilePath(phoneNumber) {
    // Sanitize phone number for filename
    const safePhone = phoneNumber.replace(/[^0-9]/g, '');
    return path.join(DATA_DIR, `${safePhone}.json`);
}

/**
 * Load or create a user profile
 */
function loadProfile(phoneNumber) {
    const filePath = getProfilePath(phoneNumber);

    if (fs.existsSync(filePath)) {
        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            console.warn(`[Progress] Corrupted profile for ${phoneNumber}, creating new`);
            return createDefaultProfile(phoneNumber);
        }
    }

    return createDefaultProfile(phoneNumber);
}

/**
 * Save a user profile
 */
function saveProfile(profile) {
    const filePath = getProfilePath(profile.phoneNumber);
    fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), 'utf-8');
}

/**
 * Update profile after a message exchange
 * @param {string} phoneNumber
 * @param {object} analysis - { hadErrors: boolean, errorTypes: string[], topic: string }
 */
function updateProgress(phoneNumber, analysis = {}) {
    const profile = loadProfile(phoneNumber);

    // Increment message count
    profile.messageCount += 1;

    // Track errors
    if (analysis.hadErrors) {
        profile.totalErrors += 1;
        profile.correctStreak = 0;
        if (analysis.errorTypes) {
            for (const errType of analysis.errorTypes) {
                if (!profile.commonErrors.includes(errType)) {
                    profile.commonErrors.push(errType);
                    // Keep only last 10 error types
                    if (profile.commonErrors.length > 10) {
                        profile.commonErrors.shift();
                    }
                }
            }
        }
    } else {
        profile.totalCorrect += 1;
        profile.correctStreak += 1;
    }

    // Track topic
    if (analysis.topic && !profile.topicsPracticed.includes(analysis.topic)) {
        profile.topicsPracticed.push(analysis.topic);
        if (profile.topicsPracticed.length > 20) {
            profile.topicsPracticed.shift();
        }
    }

    // Update streak
    const today = new Date().toISOString().split('T')[0];
    if (profile.lastStreakDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (profile.lastStreakDate === yesterday) {
            profile.streak += 1;
        } else if (profile.lastStreakDate !== today) {
            profile.streak = 1;
        }
        profile.lastStreakDate = today;
    }

    // Auto-level progression
    profile.level = calculateLevel(profile);

    // Update timestamp
    profile.lastInteraction = new Date().toISOString();

    saveProfile(profile);
    return profile;
}

/**
 * Calculate the appropriate level based on progress
 */
function calculateLevel(profile) {
    const { messageCount, correctStreak, totalCorrect, totalErrors } = profile;
    const accuracy = totalCorrect + totalErrors > 0
        ? totalCorrect / (totalCorrect + totalErrors)
        : 0;

    // Advanced: 100+ messages, >80% accuracy, and 10+ correct streak
    if (messageCount >= 100 && accuracy >= 0.8 && correctStreak >= 10) {
        return 'advanced';
    }

    // Intermediate: 30+ messages, >65% accuracy, and 5+ correct streak
    if (messageCount >= 30 && accuracy >= 0.65 && correctStreak >= 5) {
        return 'intermediate';
    }

    return 'beginner';
}

/**
 * Toggle Hindi mode for a user
 */
function toggleHindiMode(phoneNumber, enabled) {
    const profile = loadProfile(phoneNumber);
    profile.hindiMode = enabled;
    saveProfile(profile);
    return profile;
}

/**
 * Get a formatted progress summary
 */
function getProgressSummary(phoneNumber) {
    const profile = loadProfile(phoneNumber);
    const accuracy = profile.totalCorrect + profile.totalErrors > 0
        ? Math.round((profile.totalCorrect / (profile.totalCorrect + profile.totalErrors)) * 100)
        : 0;

    return `Here is your progress so far. You are at the ${profile.level} level. ` +
        `You have practiced ${profile.messageCount} messages with ${accuracy} percent accuracy. ` +
        `Your current streak is ${profile.streak} days in a row. ` +
        `${profile.correctStreak > 3 ? `Great job, you have gotten ${profile.correctStreak} correct answers in a row!` : ''} ` +
        `Keep practicing every day, you are doing amazing!`;
}

module.exports = {
    loadProfile,
    saveProfile,
    updateProgress,
    toggleHindiMode,
    getProgressSummary,
};
