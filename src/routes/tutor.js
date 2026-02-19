/**
 * Tutor Routes — /api/tutor
 * POST /api/tutor/chat     — Voice/text conversation with AI tutor
 * POST /api/tutor/analyze  — Grammar + pronunciation analysis only
 */

const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { generateTutorResponse } = require('../services/aiTutor');
const { analyzeGrammar } = require('../modules/grammarAnalyzer');
const { scorePronunciation } = require('../modules/pronunciationScorer');
const { recordSession, loadProfile } = require('../modules/progressTracker');
const { buildAdaptiveContext, getPersonalizedContext } = require('../modules/personalizationEngine');
const { generateSystemPrompt, generateScenarioPrompt } = require('../prompts/systemPrompt');

const router = express.Router();
const aiRateLimit = createRateLimiter({ windowMs: 60_000, max: 20 }); // 20 AI calls/min

// ─────────────────────────────────────────────
// POST /api/tutor/chat
// Body: { text: string, scenario?: string, referenceText?: string }
// ─────────────────────────────────────────────
router.post('/chat', verifyToken, aiRateLimit, async (req, res) => {
    try {
        const { text, scenario, referenceText } = req.body;

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ error: 'text field is required and cannot be empty.' });
        }
        if (text.length > 1000) {
            return res.status(400).json({ error: 'Message too long. Keep it under 1000 characters.' });
        }

        const userId = req.userId;
        const profile = loadProfile(userId);

        // Run grammar analysis and AI response in parallel for speed
        const [tutorReply, grammarAnalysis] = await Promise.all([
            generateTutorResponse(text, { ...profile, phoneNumber: userId }),
            analyzeGrammar(text, profile.level),
        ]);

        // Pronunciation scoring (compare spoken text with reference if provided)
        const pronunciationScore = scorePronunciation(
            referenceText || text,   // reference
            text,                    // what was actually transcribed
            profile.level
        );

        // Record session + update progress
        const hadErrors = grammarAnalysis.errors.length > 0;
        const errorTypes = grammarAnalysis.errors.map(e => e.type);
        const { xpGained, newBadges } = recordSession(userId, {
            hadErrors,
            errorTypes,
            topic: scenario || 'general',
            scenario: scenario || null,
            grammarScore: grammarAnalysis.overallScore,
            userText: text,
        });

        // Get personalized insights for this user
        const updatedProfile = loadProfile(userId);
        const personalContext = getPersonalizedContext(updatedProfile);

        res.json({
            tutor: {
                reply: tutorReply,
                scenario: scenario || null,
            },
            grammar: {
                originalText: grammarAnalysis.originalText,
                correctedText: grammarAnalysis.correctedText,
                overallScore: grammarAnalysis.overallScore,
                errors: grammarAnalysis.errors,
                encouragement: grammarAnalysis.encouragement,
            },
            pronunciation: pronunciationScore,
            progress: {
                xpGained,
                newBadges: newBadges.map(({ condition: _, ...b }) => b),
                streak: updatedProfile.streak,
                level: updatedProfile.level,
                shouldLevelUp: personalContext.shouldLevelUp,
            },
        });

    } catch (err) {
        console.error('[Tutor/chat]', err);
        res.status(500).json({ error: 'Tutor is momentarily unavailable. Please try again.' });
    }
});

// ─────────────────────────────────────────────
// POST /api/tutor/analyze
// Analyze only — no AI tutor response generated
// Body: { text: string, referenceText?: string }
// ─────────────────────────────────────────────
router.post('/analyze', verifyToken, aiRateLimit, async (req, res) => {
    try {
        const { text, referenceText } = req.body;

        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'text is required.' });
        }

        const profile = loadProfile(req.userId);

        const [grammar, pronunciation] = await Promise.all([
            analyzeGrammar(text, profile.level),
            Promise.resolve(scorePronunciation(referenceText || text, text, profile.level)),
        ]);

        res.json({ grammar, pronunciation });

    } catch (err) {
        console.error('[Tutor/analyze]', err);
        res.status(500).json({ error: 'Analysis failed. Please try again.' });
    }
});

module.exports = router;
