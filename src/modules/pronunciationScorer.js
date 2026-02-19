/**
 * Pronunciation Scorer Module
 *
 * Scores pronunciation quality by comparing what was SAID (transcription)
 * to what was EXPECTED (reference text), using syllable overlap and
 * phoneme-difficulty heuristics. Works without a dedicated pronunciation API.
 *
 * For production, this can be enhanced with Azure Cognitive Services
 * Pronunciation Assessment or Google Cloud Speech-to-Text confidence scores.
 */

// Common phoneme difficulty patterns for non-native English speakers
const DIFFICULT_PHONEMES = {
    beginner: [
        /\bthe\b/gi,          // 'th' sound
        /\bthis\b/gi,
        /\bthink\b/gi,
        /[aeiou]{2,}/g,      // vowel clusters
        /\Br\B/g,            // 'r' sound in middle of words
        /w[aeiou]/gi,        // 'w' + vowel
    ],
    intermediate: [
        /tion\b/gi,          // -tion ending
        /ough/gi,            // rough/through/dough
        /able\b/gi,          // -able ending
        /\bsch/gi,           // sch- words
    ],
    advanced: [
        /eau/gi,             // bureau, etc.
        /cqu/gi,             // acquire
        /\bght\b/gi,         // -ght silent
    ],
};

// Words that frequently cause pronunciation issues for English learners
const COMMONLY_MISPRONOUNCED = [
    'comfortable', 'temperature', 'february', 'wednesday', 'library',
    'particularly', 'literally', 'probably', 'business', 'beautiful',
    'vegetable', 'chocolate', 'different', 'interesting', 'secretary',
    'government', 'environment', 'regularly', 'preliminary', 'necessary',
];

/**
 * Tokenize text into syllable-approximate units
 * Simple heuristic: count vowel groups as syllables
 */
function countSyllables(word) {
    const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
    const matches = cleaned.match(/[aeiouy]+/g);
    return matches ? Math.max(1, matches.length) : 1;
}

/**
 * Calculate word overlap ratio between expected and transcribed text
 */
function wordOverlapScore(expected, actual) {
    const expectedWords = expected.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
    const actualWords = actual.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);

    if (expectedWords.length === 0) return 100;

    const expectedSet = new Set(expectedWords);
    let matched = 0;
    for (const word of actualWords) {
        if (expectedSet.has(word)) matched++;
    }

    return Math.round((matched / expectedWords.length) * 100);
}

/**
 * Find words in the text that are commonly mispronounced
 */
function findDifficultWords(text) {
    const words = text.toLowerCase().split(/\s+/);
    return words.filter(w => {
        const clean = w.replace(/[^a-z]/g, '');
        return COMMONLY_MISPRONOUNCED.some(m => m === clean || clean.includes(m.slice(0, 5)));
    });
}

/**
 * Score pronunciation quality.
 *
 * @param {string} referenceText   - The text the user was supposed to say
 * @param {string} transcription   - What the speech-to-text engine heard
 * @param {string} level           - 'beginner' | 'intermediate' | 'advanced'
 * @returns {{
 *   score: number,           // 0–100
 *   grade: string,           // 'Excellent'|'Good'|'Fair'|'Needs Practice'
 *   difficultWords: string[],
 *   tips: string[],
 *   syllableComplexity: number,
 *   wordAccuracy: number
 * }}
 */
function scorePronunciation(referenceText, transcription, level = 'beginner') {
    if (!referenceText || !transcription) {
        return { score: 0, grade: 'Unavailable', difficultWords: [], tips: [], syllableComplexity: 0, wordAccuracy: 0 };
    }

    // 1. Word accuracy (how many expected words appeared in transcription)
    const wordAccuracy = wordOverlapScore(referenceText, transcription);

    // 2. Find difficult words in the reference
    const difficultWords = findDifficultWords(referenceText);

    // 3. Syllable complexity of the reference text
    const words = referenceText.split(/\s+/);
    const avgSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0) / Math.max(1, words.length);
    const syllableComplexity = Math.round(Math.min(100, avgSyllables * 25));

    // 4. Phoneme difficulty penalty
    const phonemePatterns = [
        ...(DIFFICULT_PHONEMES[level] || []),
        ...(DIFFICULT_PHONEMES.beginner || []),
    ];
    let phonemePenalty = 0;
    for (const pattern of phonemePatterns) {
        const matches = referenceText.match(pattern) || [];
        phonemePenalty += matches.length * 2;
    }
    phonemePenalty = Math.min(20, phonemePenalty); // cap at 20 points

    // 5. Final score calculation
    const rawScore = wordAccuracy - phonemePenalty + (difficultWords.length > 0 ? -5 : 0);
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    // 6. Grade
    let grade;
    if (score >= 90) grade = 'Excellent 🌟';
    else if (score >= 75) grade = 'Good 👍';
    else if (score >= 55) grade = 'Fair 📈';
    else grade = 'Needs Practice 💪';

    // 7. Personalized tips
    const tips = [];
    if (difficultWords.length > 0) {
        tips.push(`Focus on these tricky words: "${difficultWords.slice(0, 3).join('", "')}"`);
    }
    if (wordAccuracy < 70) {
        tips.push('Try speaking more slowly and clearly, one word at a time.');
    }
    if (phonemePenalty > 10) {
        tips.push('Practice "th" sounds and long vowels — they are the hardest for most learners.');
    }
    if (score >= 90) {
        tips.push('Fantastic pronunciation! You are ready for more challenging sentences.');
    }

    return { score, grade, difficultWords, tips, syllableComplexity, wordAccuracy };
}

/**
 * Generate phonetic breakdown tips for a single word
 * @param {string} word
 * @returns {string}
 */
function phoneticBreakdown(word) {
    // Simple syllable split for TTS coaching
    const vowelGroups = word.match(/[aeiouy]+[^aeiouy]*/gi) || [word];
    return vowelGroups.join('·');
}

module.exports = { scorePronunciation, phoneticBreakdown, findDifficultWords };
