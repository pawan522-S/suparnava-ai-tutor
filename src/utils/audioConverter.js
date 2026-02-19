const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegPath);

const TEMP_DIR = path.join(__dirname, '..', '..', 'temp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Convert OGG/Opus (WhatsApp voice note) → MP3 (for OpenAI Whisper)
 */
function oggToMp3(inputPath) {
  const outputPath = inputPath.replace(/\.ogg$/i, '.mp3');
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('mp3')
      .audioBitrate('64k')
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`OGG→MP3 conversion failed: ${err.message}`)))
      .save(outputPath);
  });
}

/**
 * Convert MP3 (from OpenAI TTS) → OGG/Opus (for WhatsApp voice message)
 */
function mp3ToOgg(inputPath) {
  const outputPath = inputPath.replace(/\.mp3$/i, '.ogg');
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('ogg')
      .audioCodec('libopus')
      .audioBitrate('48k')
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`MP3→OGG conversion failed: ${err.message}`)))
      .save(outputPath);
  });
}

/**
 * Get a temporary file path
 */
function getTempPath(filename) {
  return path.join(TEMP_DIR, filename);
}

/**
 * Clean up temporary files
 */
function cleanupFiles(...filePaths) {
  for (const filePath of filePaths) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn(`[Cleanup] Could not delete ${filePath}: ${err.message}`);
    }
  }
}

module.exports = { oggToMp3, mp3ToOgg, getTempPath, cleanupFiles, TEMP_DIR };
