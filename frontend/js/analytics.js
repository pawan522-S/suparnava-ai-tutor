/**
 * analytics.js — Canvas-based charts for the progress dashboard
 * No external chart library needed — pure canvas rendering
 */

const Charts = (() => {

    const COLORS = {
        primary: '#7c6ef5',
        secondary: '#c084fc',
        accent: '#38bdf8',
        success: '#34d399',
        warning: '#fbbf24',
        danger: '#f87171',
        muted: 'rgba(255,255,255,0.12)',
        text: '#c4c2d9',
        textDim: '#7b78a8',
    };

    // ── Utility ──────────────────────────────────────────────
    function setupCanvas(canvas) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        return { ctx, W: rect.width, H: rect.height };
    }

    function lerp(a, b, t) { return a + (b - a) * t; }

    // ── Line Chart — Accuracy Trend ─────────────────────────
    function drawLineChart(canvas, data /* [{date, score}] */) {
        if (!canvas || data.length === 0) return;
        const { ctx, W, H } = setupCanvas(canvas);
        const pad = { t: 20, r: 16, b: 40, l: 40 };
        const iW = W - pad.l - pad.r;
        const iH = H - pad.t - pad.b;

        ctx.clearRect(0, 0, W, H);

        const values = data.map(d => d.score ?? 0);
        const max = Math.max(...values, 100);
        const min = Math.min(...values, 0);
        const range = max - min || 1;

        const xOf = i => pad.l + (i / Math.max(1, data.length - 1)) * iW;
        const yOf = v => pad.t + iH - ((v - min) / range) * iH;

        // Grid lines
        ctx.strokeStyle = COLORS.muted;
        ctx.lineWidth = 1;
        [0, 25, 50, 75, 100].forEach(v => {
            if (v < min || v > max) return;
            const y = yOf(v);
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + iW, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = COLORS.textDim;
            ctx.font = '10px Inter';
            ctx.fillText(v, 4, y + 4);
        });

        if (data.length < 2) {
            // Single point
            ctx.fillStyle = COLORS.primary;
            ctx.beginPath();
            ctx.arc(xOf(0), yOf(values[0] || 0), 5, 0, Math.PI * 2);
            ctx.fill();
            return;
        }

        // Fill gradient under line
        const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + iH);
        grad.addColorStop(0, 'rgba(124,110,245,0.35)');
        grad.addColorStop(1, 'rgba(124,110,245,0.0)');
        ctx.beginPath();
        ctx.moveTo(xOf(0), yOf(values[0]));
        values.forEach((v, i) => { if (i > 0) ctx.lineTo(xOf(i), yOf(v)); });
        ctx.lineTo(xOf(values.length - 1), pad.t + iH);
        ctx.lineTo(xOf(0), pad.t + iH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        const lineGrad = ctx.createLinearGradient(pad.l, 0, pad.l + iW, 0);
        lineGrad.addColorStop(0, COLORS.primary);
        lineGrad.addColorStop(1, COLORS.secondary);
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        values.forEach((v, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)));
        ctx.stroke();

        // Dots + x-labels
        values.forEach((v, i) => {
            ctx.fillStyle = COLORS.primary;
            ctx.beginPath();
            ctx.arc(xOf(i), yOf(v), 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#0d0e1a';
            ctx.lineWidth = 2;
            ctx.stroke();

            if (data[i]?.date) {
                ctx.fillStyle = COLORS.textDim;
                ctx.font = '9px Inter';
                ctx.textAlign = 'center';
                ctx.fillText(data[i].date.slice(5), xOf(i), H - 8);
            }
        });
    }

    // ── Donut Chart — Error Types ────────────────────────────
    function drawDonutChart(canvas, data /* {label: count} */) {
        if (!canvas) return;
        const { ctx, W, H } = setupCanvas(canvas);
        ctx.clearRect(0, 0, W, H);

        const entries = Object.entries(data).filter(([, v]) => v > 0);
        if (entries.length === 0) {
            ctx.fillStyle = COLORS.textDim;
            ctx.font = '13px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('No errors yet — great job!', W / 2, H / 2);
            return;
        }

        const total = entries.reduce((s, [, v]) => s + v, 0);
        const cx = W / 2, cy = H / 2 - 12;
        const outerR = Math.min(W, H) / 2 - 20;
        const innerR = outerR * 0.58;

        const palette = [COLORS.primary, COLORS.secondary, COLORS.accent, COLORS.success, COLORS.warning, COLORS.danger];
        let angle = -Math.PI / 2;

        entries.forEach(([label, val], i) => {
            const slice = (val / total) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, outerR, angle, angle + slice);
            ctx.closePath();
            ctx.fillStyle = palette[i % palette.length];
            ctx.fill();
            angle += slice;
        });

        // Inner circle mask
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.fillStyle = '#0d0e1a';
        ctx.fill();

        // Center label
        ctx.fillStyle = '#f1f0ff';
        ctx.font = `bold 20px Outfit`;
        ctx.textAlign = 'center';
        ctx.fillText(total, cx, cy + 6);
        ctx.fillStyle = COLORS.textDim;
        ctx.font = '10px Inter';
        ctx.fillText('errors', cx, cy + 20);

        // Legend below
        const legendY = cy + outerR + 8;
        const itemW = W / Math.min(3, entries.length);
        entries.slice(0, 6).forEach(([label], i) => {
            const lx = (i % 3) * itemW + itemW / 2;
            const ly = legendY + Math.floor(i / 3) * 18;
            ctx.fillStyle = palette[i % palette.length];
            ctx.fillRect(lx - 20, ly, 8, 8);
            ctx.fillStyle = COLORS.textDim;
            ctx.font = '9px Inter';
            ctx.textAlign = 'left';
            ctx.fillText(label.replace(/_/g, ' '), lx - 10, ly + 8);
        });
    }

    // ── Bar Chart — Weekly Activity ───────────────────────────
    function drawBarChart(canvas, data /* [{date, count}] */) {
        if (!canvas || data.length === 0) return;
        const { ctx, W, H } = setupCanvas(canvas);
        ctx.clearRect(0, 0, W, H);

        const pad = { t: 16, r: 12, b: 28, l: 12 };
        const iW = W - pad.l - pad.r;
        const iH = H - pad.t - pad.b;
        const max = Math.max(...data.map(d => d.count), 1);

        const barW = (iW / data.length) * 0.6;
        const gap = (iW / data.length) * 0.4;
        const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

        data.forEach((d, i) => {
            const barH = (d.count / max) * iH;
            const x = pad.l + i * (barW + gap) + gap / 2;
            const y = pad.t + iH - barH;

            // Bar gradient
            const grad = ctx.createLinearGradient(0, y, 0, pad.t + iH);
            grad.addColorStop(0, d.count > 0 ? COLORS.primary : COLORS.muted);
            grad.addColorStop(1, d.count > 0 ? COLORS.secondary : COLORS.muted);

            ctx.fillStyle = grad;
            ctx.beginPath();
            const radius = Math.min(4, barH / 2);
            ctx.roundRect(x, y, barW, barH, [radius, radius, 0, 0]);
            ctx.fill();

            // Day label
            const dayLabel = days[new Date(d.date + 'T12:00:00').getDay()] || '?';
            ctx.fillStyle = d.count > 0 ? COLORS.text : COLORS.textDim;
            ctx.font = '10px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(dayLabel, x + barW / 2, pad.t + iH + 16);
        });
    }

    // ── Score Ring (SVG-based, animated) ─────────────────────
    function animateScoreRing(svgEl, score, color = '#7c6ef5') {
        if (!svgEl) return;
        const circle = svgEl.querySelector('.ring-fill');
        const textEl = svgEl.querySelector('.ring-label');
        if (!circle) return;

        const r = parseFloat(circle.getAttribute('r')) || 40;
        const circumf = 2 * Math.PI * r;
        const dashOffset = circumf - (score / 100) * circumf;

        circle.style.strokeDasharray = circumf;
        circle.style.strokeDashoffset = circumf; // start from 0
        circle.style.stroke = color;
        circle.style.transition = 'stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)';

        setTimeout(() => {
            circle.style.strokeDashoffset = dashOffset;
        }, 100);

        if (textEl) {
            let current = 0;
            const step = score / 60;
            const timer = setInterval(() => {
                current = Math.min(score, current + step);
                textEl.textContent = Math.round(current);
                if (current >= score) clearInterval(timer);
            }, 16);
        }
    }

    return { drawLineChart, drawDonutChart, drawBarChart, animateScoreRing };
})();

window.Charts = Charts;
