/**
 * Challenges Routes — /api/challenges
 * GET  /api/challenges/daily        — Get today's daily challenge
 * POST /api/challenges/submit       — Submit answer and get evaluation
 */

const express = require('express');
const OpenAI = require('openai');
const { verifyToken } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { loadProfile, recordSession, awardXP, saveProfile } = require('../modules/progressTracker');
const { analyzeGrammar } = require('../modules/grammarAnalyzer');

const router = express.Router();
const rateLim = createRateLimiter({ windowMs: 60_000, max: 10 });

// AI client
const provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
const aiClient = new OpenAI({
    apiKey: provider === 'groq' ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY,
    baseURL: provider === 'groq' ? 'https://api.groq.com/openai/v1' : undefined,
});
const MODEL = provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

// ─────────────────────────────────────────────
// Challenge bank — 7 per level (rotate by day-of-year)
// ─────────────────────────────────────────────
const CHALLENGE_BANK = {
    beginner: [
        { id: 'b1', title: 'Morning Routine', prompt: 'Describe your morning routine in 3 sentences using simple present tense.', xp: 75 },
        { id: 'b2', title: 'Favourite Food', prompt: 'Talk about your favourite food. What is it? Why do you like it?', xp: 75 },
        { id: 'b3', title: 'My Family', prompt: 'Introduce your family. Mention at least 2 family members.', xp: 75 },
        { id: 'b4', title: 'My City', prompt: 'Describe where you live. What is it like there?', xp: 75 },
        { id: 'b5', title: 'Weekend Plans', prompt: 'What are your plans for this weekend? Use "I am going to..." or "I will..."', xp: 75 },
        { id: 'b6', title: 'A Friend', prompt: 'Describe your best friend. What are they like?', xp: 75 },
        { id: 'b7', title: 'Numbers Challenge', prompt: 'Count out loud from 1 to 20, then say today\'s date in full.', xp: 60 },
    ],
    intermediate: [
        { id: 'i1', title: 'Opinion Time', prompt: 'Do you think technology is making people more or less social? Give 3 reasons.', xp: 100 },
        { id: 'i2', title: 'Travel Dream', prompt: 'Describe your dream travel destination and what you would do there.', xp: 100 },
        { id: 'i3', title: 'Past Experience', prompt: 'Tell me about the most interesting experience you have had this month.', xp: 100 },
        { id: 'i4', title: 'Work or Study', prompt: 'Explain your job or studies to someone who knows nothing about it.', xp: 100 },
        { id: 'i5', title: 'Problem Solving', prompt: 'You missed an important meeting. How would you explain it to your boss?', xp: 100 },
        { id: 'i6', title: 'Advice Column', prompt: 'Your friend wants to learn English. Give them 3 pieces of advice.', xp: 100 },
        { id: 'i7', title: 'Compare & Contrast', prompt: 'Compare life in a big city vs a small town. Which do you prefer?', xp: 100 },
    ],
    advanced: [
        { id: 'a1', title: 'Debate It!', prompt: 'Argue for this position in 5 sentences: "Social media should be regulated by governments."', xp: 150 },
        { id: 'a2', title: 'Pitch Perfect', prompt: 'Give a 60-second sales pitch for a product or app you love.', xp: 150 },
        { id: 'a3', title: 'Idiom Master', prompt: 'Use these 3 idioms naturally in a short story: "break the ice", "hit the nail on the head", "on the fence".', xp: 150 },
        { id: 'a4', title: 'Storyteller', prompt: 'Tell a compelling story about a time you overcame a challenge. Use varied tenses.', xp: 150 },
        { id: 'a5', title: 'Abstract Thinker', prompt: 'What does "success" mean to you? Answer using abstract reasoning and complex sentences.', xp: 150 },
        { id: 'a6', title: 'Critical Review', prompt: 'Review a book, movie, or TV show you have recently experienced. Include pros and cons.', xp: 150 },
        { id: 'a7', title: 'The News Room', prompt: 'Summarize a current event and give your opinion on how it could be resolved.', xp: 150 },
    ],
};

function getDailyChallenge(level) {
    const bank = CHALLENGE_BANK[level] || CHALLENGE_BANK.beginner;
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86_400_000);
    return bank[dayOfYear % bank.length];
}

// ─────────────────────────────────────────────
// GET /api/challenges/daily
// ─────────────────────────────────────────────
router.get('/daily', verifyToken, (req, res) => {
    try {
        const profile = loadProfile(req.userId);
        const challenge = getDailyChallenge(profile.level);
        const today = new Date().toISOString().split('T')[0];
        const submitted = (profile.dailyChallengeHistory || []).includes(`${today}_${challenge.id}`);

        res.json({
            challenge: { ...challenge, level: profile.level },
            alreadySubmitted: submitted,
            streak: profile.streak,
            date: today,
        });

    } catch (err) {
        console.error('[Challenges/daily]', err);
        res.status(500).json({ error: 'Could not load daily challenge.' });
    }
});

// ─────────────────────────────────────────────
// POST /api/challenges/submit
// Body: { challengeId: string, response: string }
// ─────────────────────────────────────────────
router.post('/submit', verifyToken, rateLim, async (req, res) => {
    try {
        const { challengeId, response: userResponse } = req.body;

        if (!challengeId || !userResponse) {
            return res.status(400).json({ error: 'challengeId and response are required.' });
        }

        const profile = loadProfile(req.userId);
        const today = new Date().toISOString().split('T')[0];
        const submitKey = `${today}_${challengeId}`;

        // Prevent duplicate submissions
        profile.dailyChallengeHistory = profile.dailyChallengeHistory || [];
        if (profile.dailyChallengeHistory.includes(submitKey)) {
            return res.status(409).json({ error: 'You already submitted this challenge today.' });
        }

        // Find challenge
        const allChallenges = Object.values(CHALLENGE_BANK).flat();
        const challenge = allChallenges.find(c => c.id === challengeId);
        if (!challenge) return res.status(404).json({ error: 'Challenge not found.' });

        // Grammar analysis + AI evaluation in parallel
        const [grammar, aiEval] = await Promise.all([
            analyzeGrammar(userResponse, profile.level),
            aiClient.chat.completions.create({
                model: MODEL,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an English tutor evaluating a student\'s spoken English challenge response. Be encouraging and constructive. Keep your feedback to 3 sentences maximum. Return ONLY plain text, no formatting.',
                    },
                    {
                        role: 'user',
                        content: `Challenge: "${challenge.prompt}"\n\nStudent response: "${userResponse}"\n\nGive brief, friendly feedback on their response.`,
                    },
                ],
                max_tokens: 150,
                temperature: 0.7,
            }),
        ]);

        const aiFeedback = aiEval.choices[0].message.content.trim();

        // Record submission + award XP
        profile.dailyChallengeHistory.push(submitKey);
        if (profile.dailyChallengeHistory.length > 100) profile.dailyChallengeHistory.shift();

        const { xpGained, newBadges } = awardXP(profile, 'challenge_complete');
        saveProfile(profile);

        // Also record in session tracker
        recordSession(req.userId, {
            hadErrors: grammar.errors.length > 0,
            errorTypes: grammar.errors.map(e => e.type),
            topic: 'daily_challenge',
            grammarScore: grammar.overallScore,
            userText: userResponse,
        });

        res.json({
            feedback: aiFeedback,
            grammar,
            xpGained: xpGained + (challenge.xp || 75),
            newBadges: newBadges.map(({ condition: _, ...b }) => b),
            message: 'Challenge complete! Well done! 🏆',
        });

    } catch (err) {
        console.error('[Challenges/submit]', err);
        res.status(500).json({ error: 'Could not evaluate submission. Please try again.' });
    }
});

module.exports = router;
