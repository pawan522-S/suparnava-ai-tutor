/**
 * Lessons Routes — /api/lessons
 * GET  /api/lessons          — Fetch personalized lesson list
 * POST /api/lessons/complete — Mark a lesson as complete
 */

const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { generateLessonPlan, getOfflineLessons } = require('../modules/lessonGenerator');
const { recordLessonComplete, loadProfile } = require('../modules/progressTracker');

const router = express.Router();

// ─────────────────────────────────────────────
// GET /api/lessons
// ─────────────────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
    try {
        const profile = loadProfile(req.userId);

        // Generate personalized plan (uses AI + offline fallback)
        const lessons = await generateLessonPlan(profile);

        // Mark which lessons are already completed
        const completed = profile.completedLessonIds || [];
        const enriched = lessons.map(lesson => ({
            ...lesson,
            completed: completed.includes(lesson.id),
            locked: false, // All lessons unlocked by default; add gate logic here if desired
        }));

        res.json({
            lessons: enriched,
            stats: {
                total: enriched.length,
                completed: enriched.filter(l => l.completed).length,
                level: profile.level,
            },
        });

    } catch (err) {
        console.error('[Lessons/list]', err);
        // Emergency offline fallback
        const profile = loadProfile(req.userId);
        const offline = getOfflineLessons(profile.level);
        res.json({ lessons: offline, offline: true });
    }
});

// ─────────────────────────────────────────────
// POST /api/lessons/complete
// Body: { lessonId: string, xpOverride?: number }
// ─────────────────────────────────────────────
router.post('/complete', verifyToken, (req, res) => {
    try {
        const { lessonId, xpOverride } = req.body;

        if (!lessonId) {
            return res.status(400).json({ error: 'lessonId is required.' });
        }

        const { profile, xpGained, newBadges } = recordLessonComplete(
            req.userId, lessonId, xpOverride || 50
        );

        res.json({
            message: 'Lesson completed! Great work! 🎉',
            xpGained,
            newBadges: newBadges.map(({ condition: _, ...b }) => b),
            lessonsCompleted: profile.lessonsCompleted,
            totalXP: profile.xp,
        });

    } catch (err) {
        console.error('[Lessons/complete]', err);
        res.status(500).json({ error: 'Could not record lesson completion.' });
    }
});

// ─────────────────────────────────────────────
// GET /api/lessons/offline
// Always available — no AI needed
// ─────────────────────────────────────────────
router.get('/offline', verifyToken, (req, res) => {
    try {
        const profile = loadProfile(req.userId);
        const lessons = getOfflineLessons(profile.level);
        res.json({ lessons, offline: true });
    } catch (err) {
        res.status(500).json({ error: 'Could not load offline lessons.' });
    }
});

module.exports = router;
