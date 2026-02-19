/**
 * Scenarios Routes — /api/scenarios
 * GET  /api/scenarios        — List all scenario categories
 * POST /api/scenarios/start  — Start a scenario, get AI opening line
 */

const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { getScenarios } = require('../modules/lessonGenerator');
const { generateScenarioPrompt } = require('../prompts/systemPrompt');
const { loadProfile, recordSession } = require('../modules/progressTracker');
const { generateTutorResponse } = require('../services/aiTutor');

const router = express.Router();
const rateLim = createRateLimiter({ windowMs: 60_000, max: 15 });

// ─────────────────────────────────────────────
// GET /api/scenarios
// ─────────────────────────────────────────────
router.get('/', verifyToken, (req, res) => {
    try {
        const profile = loadProfile(req.userId);
        const scenarios = getScenarios();
        const practiced = profile.scenarioHistory || [];

        const enriched = scenarios.map(s => ({
            ...s,
            practiced: practiced.includes(s.id),
            // Suggest scenarios that match user level or haven't been tried
            recommended: s.level === profile.level && !practiced.includes(s.id),
        }));

        res.json({ scenarios: enriched });

    } catch (err) {
        console.error('[Scenarios/list]', err);
        res.status(500).json({ error: 'Could not load scenarios.' });
    }
});

// ─────────────────────────────────────────────
// POST /api/scenarios/start
// Body: { scenarioId: string }
// Returns the AI tutor's opening line for the scenario
// ─────────────────────────────────────────────
router.post('/start', verifyToken, rateLim, async (req, res) => {
    try {
        const { scenarioId } = req.body;

        if (!scenarioId) {
            return res.status(400).json({ error: 'scenarioId is required.' });
        }

        const scenarios = getScenarios();
        const scenario = scenarios.find(s => s.id === scenarioId);
        if (!scenario) {
            return res.status(404).json({ error: 'Scenario not found.' });
        }

        const profile = loadProfile(req.userId);

        // Get scenario-specific opening from AI
        const openingMessage = await generateTutorResponse(
            `[START SCENARIO: ${scenario.label}] Please start a ${scenario.label} role-play scenario as my English tutor. Set the scene and begin naturally.`,
            { ...profile, phoneNumber: req.userId, scenario: scenarioId }
        );

        res.json({
            scenario,
            openingMessage,
            instructions: `You are now in "${scenario.label}" mode. Speak naturally as if you are in this real-life situation. Your tutor will role-play with you and correct your English as you go.`,
        });

    } catch (err) {
        console.error('[Scenarios/start]', err);
        res.status(500).json({ error: 'Could not start scenario. Please try again.' });
    }
});

module.exports = router;
