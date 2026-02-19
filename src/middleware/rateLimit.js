/**
 * Simple in-memory rate limiter middleware.
 * For production, replace with Redis-backed rate limiting (e.g., rate-limiter-flexible).
 */

const requestCounts = new Map(); // key: userId or IP → { count, windowStart }

/**
 * Create a rate limiter middleware
 * @param {object} options
 * @param {number} options.windowMs - Time window in ms (default 60_000 = 1 min)
 * @param {number} options.max - Max requests per window (default 30)
 */
function createRateLimiter({ windowMs = 60_000, max = 30 } = {}) {
    return function rateLimitMiddleware(req, res, next) {
        // Use userId if authenticated, otherwise fall back to IP
        const key = req.userId || req.ip || 'anonymous';
        const now = Date.now();

        if (!requestCounts.has(key)) {
            requestCounts.set(key, { count: 1, windowStart: now });
            return next();
        }

        const record = requestCounts.get(key);

        // Reset window if it has expired
        if (now - record.windowStart > windowMs) {
            record.count = 1;
            record.windowStart = now;
            return next();
        }

        // Increment and check
        record.count += 1;

        if (record.count > max) {
            const retryAfter = Math.ceil((record.windowStart + windowMs - now) / 1000);
            res.set('Retry-After', String(retryAfter));
            return res.status(429).json({
                error: 'Too many requests. Please slow down.',
                retryAfterSeconds: retryAfter,
            });
        }

        next();
    };
}

// Periodically clean up old entries to prevent memory leaks
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of requestCounts) {
        if (now - record.windowStart > 120_000) {
            requestCounts.delete(key);
        }
    }
}, 60_000);

module.exports = { createRateLimiter };
