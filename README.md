# 🎓 WhatsApp AI English Tutor

A voice-based WhatsApp AI tutor that teaches spoken English through daily conversation practice. It communicates primarily through **voice messages**, corrects mistakes, explains grammar, and progressively adapts to your level.

## How It Works

```
User sends voice note → Whisper (STT) → GPT-4o-mini (tutor) → TTS (voice) → WhatsApp reply
```

**Teaching method for every response:**
1. ✅ Repeat the user's sentence correctly
2. 📝 Explain mistakes simply
3. ❓ Ask a follow-up question

## Features

- 🎙️ Voice-first conversation practice
- 📈 Beginner → Intermediate → Advanced level progression
- 🗣️ Pronunciation coaching with syllable breakdowns
- 📋 Daily speaking tasks
- 🇮🇳 Hindi explanations on request
- 📊 Progress tracking & streaks
- 🎯 Real-life topics: daily life, interviews, travel, friends

## Commands

| Command | What it does |
|---------|-------------|
| `/task` | Get a daily speaking practice task |
| `/level` | Check your progress and level |
| `/hindi` | Enable Hindi explanations |
| `/english` | English-only mode |
| `/text` | Get reply as text instead of voice |
| `/reset` | Start a fresh conversation |
| `/help` | Show all commands |

## Setup

### Prerequisites
- **Node.js** 18+
- **Meta Developer Account** with a WhatsApp Business App
- **OpenAI API Key** with access to Whisper, TTS, and GPT models
- **ngrok** (for local development)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your keys:

```env
OPENAI_API_KEY=sk-your-key-here
WHATSAPP_ACCESS_TOKEN=your-whatsapp-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_VERIFY_TOKEN=any-secret-string-you-choose
```

### 3. Start the Server

```bash
npm start
```

### 4. Expose with ngrok (for development)

```bash
ngrok http 3000
```

Copy the `https://` URL from ngrok.

### 5. Configure Meta Webhook

1. Go to [Meta Developers](https://developers.facebook.com/) → Your App → WhatsApp → Configuration
2. Set **Callback URL** to: `https://your-ngrok-url.ngrok.io/webhook`
3. Set **Verify Token** to the same value as `WHATSAPP_VERIFY_TOKEN` in your `.env`
4. Subscribe to the `messages` webhook field

### 6. Start Talking!

Send a voice message to your WhatsApp Business number and the tutor will reply with a voice message!

## Project Structure

```
├── src/
│   ├── index.js              # Express server & webhook
│   ├── messageHandler.js     # Message routing & pipeline
│   ├── services/
│   │   ├── aiTutor.js        # GPT-4o-mini tutoring engine
│   │   ├── speechToText.js   # OpenAI Whisper STT
│   │   ├── textToSpeech.js   # OpenAI TTS (Nova voice)
│   │   ├── whatsappClient.js # WhatsApp Cloud API client
│   │   └── userProgress.js   # JSON-based progress tracking
│   ├── prompts/
│   │   └── systemPrompt.js   # Dynamic system prompt generator
│   └── utils/
│       └── audioConverter.js  # FFmpeg OGG↔MP3 conversion
├── user_data/                 # Per-user JSON profiles (auto-created)
├── temp/                      # Temporary audio files (auto-created)
├── .env.example
├── package.json
└── README.md
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Server | Node.js + Express |
| WhatsApp | Cloud API v21.0 |
| Speech-to-Text | OpenAI Whisper |
| Text-to-Speech | OpenAI TTS (Nova voice) |
| AI Tutor | GPT-4o-mini |
| Audio Processing | FFmpeg via fluent-ffmpeg |
| User Data | JSON file storage |

## Cost Estimate

Each voice exchange costs approximately **$0.02–0.05** (Whisper + GPT-4o-mini + TTS combined).

## License

MIT
