const { transcribeAudio } = require('./services/speechToText');
const { generateSpeech } = require('./services/textToSpeech');
const { generateTutorResponse, generateDailyTask, clearHistory } = require('./services/aiTutor');
const { downloadMedia, uploadMedia, sendVoiceMessage, sendTextMessage, markAsRead } = require('./services/whatsappClient');
const { loadProfile, updateProgress, toggleHindiMode, getProgressSummary } = require('./services/userProgress');
const { oggToMp3, mp3ToOgg, cleanupFiles } = require('./utils/audioConverter');

/**
 * Process an incoming WhatsApp message
 */
async function handleIncomingMessage(message) {
    const from = message.from;          // Sender's phone number
    const messageId = message.id;       // Message ID for read receipts
    const messageType = message.type;   // 'text', 'audio', 'image', etc.

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Handler] New ${messageType} message from ${from}`);

    // Mark as read immediately
    await markAsRead(messageId);

    try {
        // Load user profile
        const userProfile = loadProfile(from);

        let userText = '';
        let replyAsText = false;

        // ── VOICE MESSAGE ──
        if (messageType === 'audio') {
            const mediaId = message.audio.id;

            // Download → Convert → Transcribe
            const oggPath = await downloadMedia(mediaId);
            const mp3Path = await oggToMp3(oggPath);
            userText = await transcribeAudio(mp3Path);

            // Cleanup input files
            cleanupFiles(oggPath, mp3Path);

            if (!userText || userText.trim().length === 0) {
                await sendVoiceReply(from, "I couldn't hear that clearly. Could you please try sending your voice message again? Make sure to speak close to the microphone.", `empty_${Date.now()}`);
                return;
            }

            // ── TEXT MESSAGE ──
        } else if (messageType === 'text') {
            userText = message.text.body.trim();

            // Check for special commands
            const command = userText.toLowerCase();

            if (command === '/text' || command === 'text mode') {
                replyAsText = true;
                userText = 'Please reply to my messages in text from now on.';
            }

            if (command === '/task' || command === 'daily task' || command === 'give me a task') {
                const task = await generateDailyTask(userProfile);
                await sendVoiceReply(from, task, `task_${Date.now()}`);
                return;
            }

            if (command === '/level' || command === 'my level' || command === 'my progress') {
                const summary = getProgressSummary(from);
                await sendVoiceReply(from, summary, `progress_${Date.now()}`);
                return;
            }

            if (command === '/hindi' || command === 'hindi mein batao' || command === 'speak in hindi') {
                toggleHindiMode(from, true);
                await sendVoiceReply(from, "Sure! I will include Hindi explanations when needed. Aap English mein boliye, aur main Hindi mein bhi samjha dungi. Let's continue practicing!", `hindi_${Date.now()}`);
                return;
            }

            if (command === '/english' || command === 'english only') {
                toggleHindiMode(from, false);
                await sendVoiceReply(from, "Got it! I will reply only in English from now on. Let's keep practicing!", `english_${Date.now()}`);
                return;
            }

            if (command === '/reset') {
                clearHistory(from);
                await sendVoiceReply(from, "I have reset our conversation. Let's start fresh! Tell me, how are you feeling today?", `reset_${Date.now()}`);
                return;
            }

            if (command === '/help') {
                const helpText =
                    "Here are the commands you can use:\n\n" +
                    "/task — Get a daily speaking task\n" +
                    "/level — Check your progress\n" +
                    "/hindi — Enable Hindi explanations\n" +
                    "/english — English only mode\n" +
                    "/text — Get reply as text\n" +
                    "/reset — Start conversation fresh\n" +
                    "/help — Show this help message\n\n" +
                    "Or just send me a voice message and let's practice English together!";
                await sendTextMessage(from, helpText);
                return;
            }

        } else {
            // Unsupported message type
            await sendVoiceReply(from, "I can only help you with voice messages and text messages right now. Please send me a voice note and let's practice speaking English together!", `unsupported_${Date.now()}`);
            return;
        }

        console.log(`[Handler] User said: "${userText}"`);

        // Generate AI tutor response
        const tutorResponse = await generateTutorResponse(userText, userProfile);

        // Update progress (simple analysis - let the AI determine if there are errors)
        updateProgress(from, {
            hadErrors: tutorResponse.toLowerCase().includes('correct way') ||
                tutorResponse.toLowerCase().includes('should be') ||
                tutorResponse.toLowerCase().includes('mistake') ||
                tutorResponse.toLowerCase().includes('instead of'),
            topic: 'general',
        });

        // Send response
        if (replyAsText) {
            await sendTextMessage(from, tutorResponse);
        } else {
            await sendVoiceReply(from, tutorResponse, `reply_${Date.now()}`);
        }

    } catch (error) {
        console.error(`[Handler] Error processing message from ${from}:`, error);
        try {
            await sendTextMessage(from, "Sorry, I had a small technical issue. Please try again in a moment! 🙏");
        } catch (sendError) {
            console.error(`[Handler] Could not send error message:`, sendError.message);
        }
    }
}

/**
 * Generate speech and send as WhatsApp voice message
 */
async function sendVoiceReply(to, text, fileId) {
    let mp3Path = null;
    let oggPath = null;

    try {
        // Text → Speech (MP3)
        const userProfile = loadProfile(to);
        const speed = userProfile.level === 'beginner' ? 0.85 : userProfile.level === 'intermediate' ? 0.95 : 1.0;
        mp3Path = await generateSpeech(text, fileId, speed);

        // MP3 → OGG/Opus (WhatsApp format)
        oggPath = await mp3ToOgg(mp3Path);

        // Upload to WhatsApp
        const mediaId = await uploadMedia(oggPath);

        // Send voice message
        await sendVoiceMessage(to, mediaId);

        console.log(`[Handler] Voice reply sent to ${to}`);
    } finally {
        // Cleanup temp files
        cleanupFiles(mp3Path, oggPath);
    }
}

module.exports = { handleIncomingMessage };
