const OpenAI = require('openai');
const { generateSystemPrompt, generateDailyTaskPrompt } = require('../prompts/systemPrompt');

// ─────────────────────────────────────────────────────────
// AI Provider Selection
//   AI_PROVIDER=groq   → Groq LLaMA 3.3 (FREE, default)
//   AI_PROVIDER=openai → OpenAI GPT-4o-mini (paid)
// ─────────────────────────────────────────────────────────
const provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();

// Groq client — OpenAI-compatible SDK with Groq base URL
const groqClient = new OpenAI({
    apiKey: process.env.GROQ_API_KEY || '',
    baseURL: 'https://api.groq.com/openai/v1',
});

// OpenAI client (fallback / alternative)
const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || '',
});

// Pick the right client and model
const client = provider === 'groq' ? groqClient : openaiClient;
const MODEL = provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

console.log(`[AI] Using ${provider.toUpperCase()} — model: ${MODEL}`);

// In-memory conversation history per user (phone number → messages[])
const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 20;

function getHistory(phoneNumber) {
    if (!conversationHistory.has(phoneNumber)) {
        conversationHistory.set(phoneNumber, []);
    }
    return conversationHistory.get(phoneNumber);
}

function trimHistory(history) {
    if (history.length > MAX_HISTORY_LENGTH) {
        history.splice(0, history.length - MAX_HISTORY_LENGTH);
    }
}

/**
 * Generate a tutor response based on user input
 * @param {string} userText - What the user said (transcribed or typed)
 * @param {object} userProfile - User profile from userProgress service
 * @returns {Promise<string>} - Tutor's text response
 */
async function generateTutorResponse(userText, userProfile) {
    const phoneNumber = userProfile.phoneNumber;
    const history = getHistory(phoneNumber);
    const systemPrompt = generateSystemPrompt(userProfile);

    history.push({ role: 'user', content: userText });
    trimHistory(history);

    console.log(`[AI] Generating response (${provider}) for ${phoneNumber} (level: ${userProfile.level})`);

    const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            ...history,
        ],
        max_tokens: 250,
        temperature: 0.7,
    });

    const assistantMessage = response.choices[0].message.content.trim();

    history.push({ role: 'assistant', content: assistantMessage });
    trimHistory(history);

    console.log(`[AI] Response: "${assistantMessage.substring(0, 100)}..."`);
    return assistantMessage;
}

/**
 * Generate a daily speaking task
 */
async function generateDailyTask(userProfile) {
    const taskPrompt = generateDailyTaskPrompt(userProfile);

    const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
            { role: 'system', content: 'You are a friendly English speaking coach. Write as if speaking aloud. No formatting, no bullet points, no emojis.' },
            { role: 'user', content: taskPrompt },
        ],
        max_tokens: 150,
        temperature: 0.9,
    });

    return response.choices[0].message.content.trim();
}

/**
 * Clear conversation history for a user (for /reset command)
 */
function clearHistory(phoneNumber) {
    conversationHistory.delete(phoneNumber);
}

module.exports = { generateTutorResponse, generateDailyTask, clearHistory };
