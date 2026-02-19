/**
 * Progress Routes — /api/progress
 * GET /api/progress         — Full analytics dashboard data
 * GET /api/progress/history — Recent session history
 */

const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getAnalytics, loadProfile } = require('../modules/progressTracker');
const { getPersonalizedContext } = require('../modules/personalizationEngine');

const router = express.Router();

// ─────────────────────────────────────────────
// GET /api/progress
// ─────────────────────────────────────────────
router.get('/', verifyToken, (req, res) => {
    try {
        const analytics = getAnalytics(req.userId);
        const profile = loadProfile(req.userId);
        const personalization = getPersonalizedContext(profile);

        res.json({
            analytics,
            personalization: {
                primaryWeakArea: personalization.primaryWeakArea,
                weakAreas: personalization.weakAreas,
                recommendedScenario: personalization.recommendedScenario,
                nextTopicSuggestion: personalization.nextTopicSuggestion,
                focusTip: personalization.focusTip,
                shouldLevelUp: personalization.shouldLevelUp,
                dynamicDifficulty: personalization.dynamicDifficulty,
            },
        });

    } catch (err) {
        console.error('[Progress/get]', err);
        res.status(500).json({ error: 'Could not load progress data.' });
    }
});

// ─────────────────────────────────────────────
// GET /api/progress/history?limit=20
// ─────────────────────────────────────────────
router.get('/history', verifyToken, (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const profile = loadProfile(req.userId);
        const logs = (profile.sessionLogs || []).slice(-limit).reverse(); // newest first

        res.json({ sessions: logs, total: (profile.sessionLogs || []).length });

    } catch (err) {
        console.error('[Progress/history]', err);
        res.status(500).json({ error: 'Could not load session history.' });
    }
});

// ─────────────────────────────────────────────
// GET /api/progress/summary — Text summary (for display)
// ─────────────────────────────────────────────
router.get('/summary', verifyToken, (req, res) => {
    try {
        const profile = loadProfile(req.userId);
        const analytics = getAnalytics(req.userId);

        const summary = `You are at ${analytics.level} level with ${analytics.accuracy}% accuracy. ` +
            `You have practiced ${analytics.messageCount} messages and earned ${analytics.xp} XP. ` +
            `Your current streak is ${analytics.streak} day${analytics.streak !== 1 ? 's' : ''} in a row. ` +
            `Keep going — you are doing amazing!`;

        res.json({ summary, analytics });

    } catch (err) {
        res.status(500).json({ error: 'Could not get summary.' });
    }
});

module.exports = router;
