const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'suparnava_secret_key_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate a JWT for the given user ID
 */
function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Express middleware: verify JWT from Authorization header
 * Attaches req.userId on success
 */
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided. Include Authorization: Bearer <token>' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired. Please log in again.' });
        }
        return res.status(401).json({ error: 'Invalid token.' });
    }
}

module.exports = { generateToken, verifyToken };
