/**
 * voiceChat.js — Web Speech API integration
 * SpeechRecognition (STT) + SpeechSynthesis (TTS) + Canvas waveform visualizer
 *
 * Key fix: always create a NEW SpeechRecognition instance per session.
 * Reusing the same instance after .stop() causes silent failures in Chrome.
 */

const VoiceChat = (() => {
    let synth = window.speechSynthesis;
    let isRecordingFlag = false;
    let audioCtx = null;
    let analyserNode = null;
    let micStream = null;
    let animFrame = null;
    let currentRecognition = null;

    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const supported = !!SpeechRecognition;

    // ── Mic permission check ─────────────────────────────────
    async function checkMicPermission() {
        try {
            const result = await navigator.permissions.query({ name: 'microphone' });
            return result.state; // 'granted' | 'denied' | 'prompt'
        } catch {
            return 'unknown';
        }
    }

    // ── Start Recording ─────────────────────────────────────
    async function startRecording(onInterim, onFinal, onError) {
        if (isRecordingFlag) return;

        // ── 1. Check browser support first ──
        if (!SpeechRecognition) {
            onError('Voice recognition is not supported in this browser. Please use Chrome or Edge.');
            return;
        }

        // ── 2. Request mic + set up audio analyser for waveform ──
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyserNode = audioCtx.createAnalyser();
            analyserNode.fftSize = 256;
            const source = audioCtx.createMediaStreamSource(micStream);
            source.connect(analyserNode);
        } catch (e) {
            let msg = 'Could not access your microphone.';
            if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                msg = '🎤 Microphone permission denied. Please click the 🔒 lock icon in your browser address bar and allow microphone access.';
            } else if (e.name === 'NotFoundError') {
                msg = 'No microphone found. Please connect a microphone and try again.';
            }
            onError(msg);
            return;
        }

        // ── 3. Always create a fresh recognition instance ──
        // IMPORTANT: Reusing the same instance after .stop() silently fails in Chrome
        currentRecognition = new SpeechRecognition();
        currentRecognition.continuous = false;
        currentRecognition.interimResults = true;
        currentRecognition.lang = 'en-US';
        currentRecognition.maxAlternatives = 1;

        let finalReceived = false;

        currentRecognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(r => r[0].transcript).join('');
            const isFinal = event.results[event.results.length - 1].isFinal;

            if (isFinal) {
                finalReceived = true;
                onFinal(transcript);
            } else {
                onInterim(transcript);
            }
        };

        currentRecognition.onerror = (event) => {
            console.warn('[Voice] Recognition error:', event.error);
            const friendlyMsg = {
                'no-speech': '🔇 No speech detected. Please speak louder and try again.',
                'audio-capture': '🎤 Could not capture audio. Check your microphone.',
                'not-allowed': '🚫 Microphone access denied. Allow it in browser settings.',
                'network': '🌐 Network error. Speech recognition needs an internet connection.',
                'aborted': null, // user aborted — don't show error
                'service-not-allowed': '🚫 Speech service not allowed. Try Chrome on localhost.',
            }[event.error];

            if (friendlyMsg) onError(friendlyMsg);
            stopRecording();
        };

        currentRecognition.onend = () => {
            isRecordingFlag = false;
            // If ended without getting a final result (e.g. very short speech), notify
            if (!finalReceived) {
                // Small delay to avoid flicker if user is just pausing
                setTimeout(() => {
                    if (!isRecordingFlag) {
                        onInterim(''); // clear interim text
                    }
                }, 300);
            }
        };

        isRecordingFlag = true;
        try {
            currentRecognition.start();
        } catch (e) {
            // "already started" or similar — create another fresh one
            console.warn('[Voice] recognition.start() threw:', e.message);
            isRecordingFlag = false;
            onError('Could not start voice recognition. Please try again.');
        }
    }

    // ── Stop Recording ──────────────────────────────────────
    function stopRecording() {
        if (currentRecognition) {
            try { currentRecognition.stop(); } catch { }
            currentRecognition = null;
        }
        if (micStream) {
            micStream.getTracks().forEach(t => t.stop());
            micStream = null;
        }
        if (audioCtx) {
            try { audioCtx.close(); } catch { }
            audioCtx = null;
        }
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        analyserNode = null;
        isRecordingFlag = false;
    }

    // ── Draw Waveform on Canvas ─────────────────────────────
    function drawWaveform(canvas, inactive = false) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.offsetWidth || canvas.width;
        const H = canvas.offsetHeight || canvas.height;
        canvas.width = W;
        canvas.height = H;

        ctx.clearRect(0, 0, W, H);

        if (inactive || !analyserNode) {
            // Flat idle line
            ctx.strokeStyle = 'rgba(124,110,245,0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, H / 2);
            ctx.lineTo(W, H / 2);
            ctx.stroke();
            return;
        }

        const bufLen = analyserNode.frequencyBinCount;
        const data = new Uint8Array(bufLen);
        analyserNode.getByteTimeDomainData(data);

        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, '#7c6ef5');
        grad.addColorStop(0.5, '#c084fc');
        grad.addColorStop(1, '#38bdf8');

        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        const sliceW = W / bufLen;
        let x = 0;
        for (let i = 0; i < bufLen; i++) {
            const v = data[i] / 128.0;
            const y = (v * H) / 2;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            x += sliceW;
        }
        ctx.lineTo(W, H / 2);
        ctx.stroke();
    }

    function startWaveformAnimation(canvas) {
        if (animFrame) cancelAnimationFrame(animFrame);
        const loop = () => {
            drawWaveform(canvas, !isRecordingFlag || !analyserNode);
            animFrame = requestAnimationFrame(loop);
        };
        loop();
    }

    function stopWaveformAnimation(canvas) {
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        if (canvas) drawWaveform(canvas, true);
    }

    // ── Text-to-Speech ──────────────────────────────────────
    function speak(text, opts = {}) {
        if (!synth) return Promise.resolve();
        synth.cancel();

        const clean = text
            .replace(/\*\*/g, '').replace(/\*/g, '').replace(/#+/g, '')
            .replace(/```[\s\S]*?```/g, '').trim();

        return new Promise((resolve) => {
            const utt = new SpeechSynthesisUtterance(clean);
            utt.lang = opts.lang || 'en-US';
            utt.rate = opts.rate || 1.0;
            utt.pitch = opts.pitch || 1.0;
            utt.volume = opts.volume || 1.0;

            // Pick a natural English voice
            const loadVoice = () => {
                const voices = synth.getVoices();
                if (voices.length > 0) {
                    const preferred = voices.find(v =>
                        v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium'))
                    ) || voices.find(v => v.lang.startsWith('en'));
                    if (preferred) utt.voice = preferred;
                    utt.onend = resolve;
                    utt.onerror = resolve;
                    synth.speak(utt);
                } else {
                    // Voices not loaded yet — wait for them
                    synth.onvoiceschanged = () => {
                        const vs = synth.getVoices();
                        const p = vs.find(v => v.lang.startsWith('en'));
                        if (p) utt.voice = p;
                        utt.onend = resolve;
                        utt.onerror = resolve;
                        synth.speak(utt);
                    };
                }
            };
            loadVoice();
        });
    }

    function stopSpeaking() {
        if (synth) synth.cancel();
    }

    return {
        supported,
        startRecording,
        stopRecording,
        drawWaveform,
        startWaveformAnimation,
        stopWaveformAnimation,
        speak,
        stopSpeaking,
        isRecording: () => isRecordingFlag,
        checkMicPermission,
    };
})();

window.VoiceChat = VoiceChat;
