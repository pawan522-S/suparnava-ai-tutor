const OpenAI = require('openai');
const googleTTS = require('google-tts-api');
const axios = require('axios');
const fs = require('fs');
const { getTempPath } = require('../utils/audioConverter');

// ─────────────────────────────────────────────────────────
// TTS Provider Selection
//   TTS_PROVIDER=google → Google TTS (FREE, no API key, default)
//   TTS_PROVIDER=openai → OpenAI TTS (paid, better voice quality)
// ─────────────────────────────────────────────────────────
const provider = (process.env.TTS_PROVIDER || 'google').toLowerCase();

// OpenAI client (only used if TTS_PROVIDER=openai)
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

/**
 * Generate speech using Google TTS (FREE, no API key needed)
 * Handles long text by splitting into chunks and merging
 */
async function generateWithGoogle(text, id) {
    console.log(`[TTS] Using Google TTS (free) for: "${text.substring(0, 60)}..."`);

    // Google TTS has a 200-char limit per request — split into sentences
    const urls = googleTTS.getAllAudioUrls(text, {
        lang: 'en',
        slow: false,
        host: 'https://translate.google.com',
        splitPunct: ',.?!;:',
    });

    const mp3Path = getTempPath(`tts_${id}.mp3`);

    // Download all chunks and merge into one file
    const chunks = [];
    for (const urlObj of urls) {
        const response = await axios.get(urlObj.url, { responseType: 'arraybuffer' });
        chunks.push(Buffer.from(response.data));
    }

    fs.writeFileSync(mp3Path, Buffer.concat(chunks));
    console.log(`[TTS] Google TTS saved: ${mp3Path}`);
    return mp3Path;
}

/**
 * Generate speech using OpenAI TTS (paid, higher quality)
 */
async function generateWithOpenAI(text, id, speed = 0.9) {
    console.log(`[TTS] Using OpenAI TTS (speed=${speed}): "${text.substring(0, 60)}..."`);

    const mp3Response = await openaiClient.audio.speech.create({
        model: 'tts-1',
        voice: 'nova',
        input: text,
        speed,
        response_format: 'mp3',
    });

    const mp3Path = getTempPath(`tts_${id}.mp3`);
    const buffer = Buffer.from(await mp3Response.arrayBuffer());
    fs.writeFileSync(mp3Path, buffer);
    console.log(`[TTS] OpenAI TTS saved: ${mp3Path}`);
    return mp3Path;
}

/**
 * Main TTS function — routes to the configured provider
 * @param {string} text - Text to speak
 * @param {string} id   - Unique file ID
 * @param {number} speed - Speed (only used for OpenAI provider)
 * @returns {Promise<string>} - Path to generated MP3 file
 */
async function generateSpeech(text, id, speed = 0.9) {
    if (provider === 'openai') {
        return generateWithOpenAI(text, id, speed);
    }
    return generateWithGoogle(text, id);
}

module.exports = { generateSpeech };
