/**
 * Personalization Engine
 *
 * Analyzes a user's error history and practice patterns to:
 * - Determine what topics to focus on next
 * - Adjust AI tutor difficulty dynamically
 * - Surface missed/weak concepts
 * - Recommend scenario modes
 */

const { LEVELS } = require('../prompts/systemPrompt');

// Error type → human-readable focus area mapping
const ERROR_FOCUS_MAP = {
    tense: { area: 'Verb Tenses', tip: 'Practice using past, present, and future tenses correctly.' },
    subject_verb_agreement: { area: 'Subject-Verb Agreement', tip: 'Remember: singular subjects take singular verbs.' },
    article: { area: 'Articles (a/an/the)', tip: 'Learn when to use "a", "an", and "the".' },
    preposition: { area: 'Prepositions', tip: 'Focus on "in", "on", "at", "for", "with" usage.' },
    word_order: { area: 'Sentence Structure', tip: 'English follows Subject-Verb-Object order.' },
    grammar: { area: 'General Grammar', tip: 'Work through basic grammar exercises.' },
    spelling: { area: 'Spelling', tip: 'Read more and use spell-check to improve spelling.' },
    vocabulary: { area: 'Vocabulary', tip: 'Learn 5 new words every day.' },
    punctuation: { area: 'Punctuation', tip: 'Practice using commas, periods, and apostrophes.' },
};

// Scenario recommendation based on error patterns
const ERROR_TO_SCENARIO = {
    tense: 'daily_talk',
    subject_verb_agreement: 'daily_talk',
    vocabulary: 'storytelling',
    grammar: 'interview',
    article: 'shopping',
    preposition: 'travel',
    word_order: 'business',
};

/**
 * Analyze the user's error history to extract insights.
 * @param {object} userProfile
 * @returns {{
 *   primaryWeakArea: string|null,
 *   weakAreas: object[],
 *   recommendedScenario: string,
 *   dynamicDifficulty: string,
 *   focusTip: string,
 *   nextTopicSuggestion: string,
 *   shouldLevelUp: boolean,
 *   shouldLevelDown: boolean
 * }}
 */
function getPersonalizedContext(userProfile) {
    const {
        level = 'beginner',
        commonErrors = [],
        messageCount = 0,
        correctStreak = 0,
        totalCorrect = 0,
        totalErrors = 0,
        topicsPracticed = [],
        sessionLogs = [],
    } = userProfile;

    // ── Error frequency analysis ──
    const errorCounts = {};
    for (const err of commonErrors) {
        const type = typeof err === 'string' ? err : err.type;
        if (type) errorCounts[type] = (errorCounts[type] || 0) + 1;
    }

    // Also analyze recent session logs for richer data
    for (const session of sessionLogs.slice(-10)) {
        for (const err of (session.errors || [])) {
            const type = typeof err === 'string' ? err : err.type;
            if (type) errorCounts[type] = (errorCounts[type] || 0) + (2); // recent errors weighted more
        }
    }

    // Sort error types by frequency
    const sortedErrors = Object.entries(errorCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count, ...(ERROR_FOCUS_MAP[type] || { area: type, tip: 'Keep practicing!' }) }));

    const primaryWeakArea = sortedErrors[0] || null;
    const weakAreas = sortedErrors.slice(0, 3);

    // ── Scenario recommendation ──
    const recommendedScenario = primaryWeakArea
        ? (ERROR_TO_SCENARIO[primaryWeakArea.type] || 'daily_talk')
        : 'daily_talk';

    // ── Dynamic difficulty adjustment ──
    const accuracy = (totalCorrect + totalErrors) > 0
        ? totalCorrect / (totalCorrect + totalErrors)
        : 0.5;

    let dynamicDifficulty;
    if (accuracy > 0.85 && correctStreak >= 8) dynamicDifficulty = 'harder';
    else if (accuracy < 0.45 || correctStreak === 0) dynamicDifficulty = 'easier';
    else dynamicDifficulty = 'maintain';

    // ── Level progression signals ──
    const shouldLevelUp = (
        level === 'beginner' && messageCount >= 30 && accuracy >= 0.65 && correctStreak >= 5
    ) || (
            level === 'intermediate' && messageCount >= 100 && accuracy >= 0.80 && correctStreak >= 10
        );

    const shouldLevelDown = accuracy < 0.35 && messageCount >= 10;

    // ── Next topic suggestion ──
    const allTopics = {
        beginner: ['greetings', 'daily routine', 'food', 'family', 'weather', 'numbers', 'colors', 'shopping'],
        intermediate: ['travel', 'work', 'opinions', 'news', 'health', 'relationships', 'environment', 'technology'],
        advanced: ['debates', 'business', 'abstract ideas', 'humor', 'storytelling', 'politics', 'philosophy'],
    };
    const availableTopics = (allTopics[level] || allTopics.beginner)
        .filter(t => !topicsPracticed.includes(t));
    const nextTopicSuggestion = availableTopics[0] || topicsPracticed[0] || 'general conversation';

    // ── Focus tip ──
    const focusTip = primaryWeakArea
        ? primaryWeakArea.tip
        : 'Great work! Keep practicing to maintain your fluency.';

    return {
        primaryWeakArea: primaryWeakArea ? primaryWeakArea.area : null,
        weakAreas,
        recommendedScenario,
        dynamicDifficulty,
        focusTip,
        nextTopicSuggestion,
        shouldLevelUp,
        shouldLevelDown,
        accuracyPercent: Math.round(accuracy * 100),
    };
}

/**
 * Build an adaptive context string to inject into the AI tutor system prompt.
 * @param {object} userProfile
 * @returns {string}
 */
function buildAdaptiveContext(userProfile) {
    const ctx = getPersonalizedContext(userProfile);
    const lines = [];

    if (ctx.primaryWeakArea) {
        lines.push(`FOCUS AREA: The student struggles most with "${ctx.primaryWeakArea}". Gently emphasize this in corrections.`);
    }
    if (ctx.dynamicDifficulty === 'harder') {
        lines.push('DIFFICULTY: Student is performing well. Increase sentence complexity slightly and introduce more advanced vocabulary.');
    } else if (ctx.dynamicDifficulty === 'easier') {
        lines.push('DIFFICULTY: Student is struggling. Keep responses shorter, use simpler words, and be extra encouraging.');
    }
    if (ctx.nextTopicSuggestion) {
        lines.push(`SUGGESTED TOPIC: If there is a natural opportunity, steer the conversation toward "${ctx.nextTopicSuggestion}".`);
    }
    if (ctx.shouldLevelUp) {
        lines.push('LEVEL UP SIGNAL: Student is ready to level up. Mention this once naturally during conversation.');
    }

    return lines.join('\n');
}

module.exports = { getPersonalizedContext, buildAdaptiveContext };
