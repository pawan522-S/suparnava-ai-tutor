const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { getTempPath } = require('../utils/audioConverter');

const GRAPH_API_URL = 'https://graph.facebook.com/v21.0';

/**
 * Get API config from environment
 */
function getConfig() {
    return {
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    };
}

/**
 * Download media (voice note) from WhatsApp
 * @param {string} mediaId - WhatsApp media ID
 * @returns {Promise<string>} - Path to downloaded file
 */
async function downloadMedia(mediaId) {
    const { accessToken } = getConfig();

    // Step 1: Get the media URL
    const mediaInfo = await axios.get(`${GRAPH_API_URL}/${mediaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    const mediaUrl = mediaInfo.data.url;

    // Step 2: Download the actual file
    const response = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'arraybuffer',
    });

    const filePath = getTempPath(`voice_${mediaId}.ogg`);
    fs.writeFileSync(filePath, response.data);

    console.log(`[WhatsApp] Downloaded media ${mediaId} → ${filePath} (${response.data.length} bytes)`);
    return filePath;
}

/**
 * Upload media to WhatsApp and get a media ID
 * @param {string} filePath - Path to the audio file (OGG/Opus)
 * @returns {Promise<string>} - Media ID
 */
async function uploadMedia(filePath) {
    const { accessToken, phoneNumberId } = getConfig();

    // Use axios to send multipart form data
    const fileStream = fs.createReadStream(filePath);
    const formData = new FormData();
    formData.append('file', fileStream, {
        filename: path.basename(filePath),
        contentType: 'audio/ogg',
    });
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', 'audio/ogg');

    const response = await axios.post(
        `${GRAPH_API_URL}/${phoneNumberId}/media`,
        formData,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...formData.getHeaders(),
            },
        }
    );

    console.log(`[WhatsApp] Uploaded media → ID: ${response.data.id}`);
    return response.data.id;
}

/**
 * Send a voice message to a user
 * @param {string} to - Recipient phone number (with country code)
 * @param {string} mediaId - WhatsApp media ID of the voice message
 */
async function sendVoiceMessage(to, mediaId) {
    const { accessToken, phoneNumberId } = getConfig();

    await axios.post(
        `${GRAPH_API_URL}/${phoneNumberId}/messages`,
        {
            messaging_product: 'whatsapp',
            to: to,
            type: 'audio',
            audio: { id: mediaId },
        },
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        }
    );

    console.log(`[WhatsApp] Sent voice message to ${to}`);
}

/**
 * Send a text message to a user
 * @param {string} to - Recipient phone number
 * @param {string} text - Message text
 */
async function sendTextMessage(to, text) {
    const { accessToken, phoneNumberId } = getConfig();

    await axios.post(
        `${GRAPH_API_URL}/${phoneNumberId}/messages`,
        {
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: { body: text },
        },
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        }
    );

    console.log(`[WhatsApp] Sent text message to ${to}`);
}

/**
 * Mark a message as read
 * @param {string} messageId - WhatsApp message ID
 */
async function markAsRead(messageId) {
    const { accessToken, phoneNumberId } = getConfig();

    try {
        await axios.post(
            `${GRAPH_API_URL}/${phoneNumberId}/messages`,
            {
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId,
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );
    } catch (err) {
        console.warn(`[WhatsApp] Could not mark message as read: ${err.message}`);
    }
}

module.exports = {
    downloadMedia,
    uploadMedia,
    sendVoiceMessage,
    sendTextMessage,
    markAsRead,
};
