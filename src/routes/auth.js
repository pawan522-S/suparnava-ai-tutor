/**
 * Auth Routes — /api/auth
 * POST /api/auth/register  — Create a new user account
 * POST /api/auth/login     — Authenticate and get JWT
 * GET  /api/auth/me        — Get current user profile
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { generateToken, verifyToken } = require('../middleware/auth');
const { fileDB } = require('../database/db');

const router = express.Router();

// ─────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, nativeLanguage = 'English', level = 'beginner' } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'name, email, and password are required.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        // Check for duplicate email
        const existing = fileDB.findBy('user', 'email', email.toLowerCase().trim());
        if (existing) {
            return res.status(409).json({ error: 'An account with that email already exists.' });
        }

        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const userId = randomUUID();

        // Create user record
        const user = {
            userId,
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            nativeLanguage,
            level,
            createdAt: new Date().toISOString(),
        };
        fileDB.save('user', userId, user);

        // Create initial progress profile
        const { createDefaultProfile, saveProfile } = require('../modules/progressTracker');
        const profile = createDefaultProfile(userId);
        profile.name = user.name;
        profile.email = user.email;
        profile.nativeLanguage = nativeLanguage;
        profile.level = level;
        saveProfile(profile);

        const token = generateToken(userId);

        const { password: _, ...safeUser } = user; // strip password from response
        res.status(201).json({ token, user: safeUser, message: 'Account created successfully! Welcome aboard 🎉' });

    } catch (err) {
        console.error('[Auth/register]', err);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// ─────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const user = fileDB.findBy('user', 'email', email.toLowerCase().trim());
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const token = generateToken(user.userId);
        const { password: _, ...safeUser } = user;

        res.json({ token, user: safeUser, message: 'Welcome back! Let\'s practice some English today 📚' });

    } catch (err) {
        console.error('[Auth/login]', err);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// ─────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────
router.get('/me', verifyToken, (req, res) => {
    try {
        const user = fileDB.load('user', req.userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const { password: _, ...safeUser } = user;
        res.json({ user: safeUser });

    } catch (err) {
        console.error('[Auth/me]', err);
        res.status(500).json({ error: 'Could not fetch profile.' });
    }
});

// ─────────────────────────────────────────────
// PUT /api/auth/profile — Update name, language, level
// ─────────────────────────────────────────────
router.put('/profile', verifyToken, (req, res) => {
    try {
        const user = fileDB.load('user', req.userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const { name, nativeLanguage, level } = req.body;
        if (name) user.name = name.trim();
        if (nativeLanguage) user.nativeLanguage = nativeLanguage;
        if (level && ['beginner', 'intermediate', 'advanced'].includes(level)) {
            user.level = level;
        }
        fileDB.save('user', user.userId, user);

        const { password: _, ...safeUser } = user;
        res.json({ user: safeUser, message: 'Profile updated.' });

    } catch (err) {
        console.error('[Auth/profile]', err);
        res.status(500).json({ error: 'Could not update profile.' });
    }
});

module.exports = router;
