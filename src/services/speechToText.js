const OpenAI = require('openai');
const fs = require('fs');

// ─────────────────────────────────────────────────────────
// STT Provider Selection
//   STT_PROVIDER=groq   → Groq Whisper (FREE, recommended)
//   STT_PROVIDER=openai → OpenAI Whisper (paid)
// ─────────────────────────────────────────────────────────
const provider = (process.env.STT_PROVIDER || 'groq').toLowerCase();

// Groq client — uses OpenAI-compatible SDK, just different base URL + key
const groqClient = new OpenAI({
    apiKey: process.env.GROQ_API_KEY || 'groq-not-configured',
    baseURL: 'https://api.groq.com/openai/v1',
});

// OpenAI client (fallback / alternative)
const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'openai-not-configured',
});

/**
 * Transcribe an audio file using Whisper (Groq or OpenAI)
 * @param {string} audioFilePath - Path to the MP3 file
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeAudio(audioFilePath) {
    console.log(`[STT] Transcribing with ${provider.toUpperCase()}: ${audioFilePath}`);

    const client = provider === 'groq' ? groqClient : openaiClient;

    // Groq uses 'whisper-large-v3-turbo' (faster, free)
    // OpenAI uses 'whisper-1'
    const model = provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1';

    const transcription = await client.audio.transcriptions.create({
        model,
        file: fs.createReadStream(audioFilePath),
        language: 'en',
    });

    const text = transcription.text.trim();
    console.log(`[STT] Result: "${text}"`);
    return text;
}

module.exports = { transcribeAudio };
