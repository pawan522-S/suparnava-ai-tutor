const OpenAI = require('openai');

// Use the same provider pattern as aiTutor.js
const provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
const client = new OpenAI({
    apiKey: provider === 'groq' ? (process.env.GROQ_API_KEY || '') : (process.env.OPENAI_API_KEY || ''),
    baseURL: provider === 'groq' ? 'https://api.groq.com/openai/v1' : undefined,
});
const MODEL = provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

/**
 * Analyze grammar mistakes in a piece of text.
 * Returns a structured JSON object with error details and overall score.
 *
 * @param {string} text        - The user's sentence(s) to analyze
 * @param {string} level       - 'beginner' | 'intermediate' | 'advanced'
 * @returns {Promise<{
 *   originalText: string,
 *   correctedText: string,
 *   overallScore: number,
 *   errors: Array<{type: string, original: string, corrected: string, explanation: string}>,
 *   encouragement: string,
 *   level: string
 * }>}
 */
async function analyzeGrammar(text, level = 'beginner') {
    const prompt = `You are an expert English grammar teacher analyzing a student's sentence at the "${level}" level.

Analyze this text: "${text}"

Return ONLY a valid JSON object with NO extra text, markdown, or explanation. Use exactly this structure:
{
  "correctedText": "<the fully corrected version of the sentence>",
  "overallScore": <integer 0-100, where 100 is perfect>,
  "errors": [
    {
      "type": "<grammar|spelling|punctuation|word_order|tense|article|preposition|subject_verb_agreement|vocabulary>",
      "original": "<the incorrect portion>",
      "corrected": "<the corrected portion>",
      "explanation": "<simple, friendly 1-sentence explanation appropriate for ${level} level>"
    }
  ],
  "encouragement": "<one short encouraging sentence for the student>"
}

If the text is grammatically perfect, return errors as an empty array and overallScore as 100.
Keep explanations simple and friendly. Do NOT return anything other than the JSON object.`;

    try {
        const response = await client.chat.completions.create({
            model: MODEL,
            messages: [
                { role: 'system', content: 'You are a grammar analysis engine. Return ONLY valid JSON. No markdown, no explanations outside the JSON.' },
                { role: 'user', content: prompt },
            ],
            max_tokens: 500,
            temperature: 0.2, // Low temperature for consistent, accurate analysis
        });

        const raw = response.choices[0].message.content.trim();

        // Safely parse — strip code fences if LLM adds them
        const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        const parsed = JSON.parse(jsonStr);

        return {
            originalText: text,
            correctedText: parsed.correctedText || text,
            overallScore: typeof parsed.overallScore === 'number' ? parsed.overallScore : 100,
            errors: Array.isArray(parsed.errors) ? parsed.errors : [],
            encouragement: parsed.encouragement || 'Keep practicing!',
            level,
        };

    } catch (err) {
        console.error('[GrammarAnalyzer] Error:', err.message);
        // Return a safe fallback so the app never crashes on analysis failure
        return {
            originalText: text,
            correctedText: text,
            overallScore: null,
            errors: [],
            encouragement: 'Keep practicing!',
            level,
            analysisError: true,
        };
    }
}

/**
 * Categorize the most common error types for a user's history.
 * @param {Array<object>} recentErrors - Array of error objects from analyzeGrammar
 * @returns {{ type: string, count: number }[]} sorted by frequency
 */
function summarizeErrorTypes(recentErrors) {
    const counts = {};
    for (const err of recentErrors) {
        counts[err.type] = (counts[err.type] || 0) + 1;
    }
    return Object.entries(counts)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);
}

module.exports = { analyzeGrammar, summarizeErrorTypes };
