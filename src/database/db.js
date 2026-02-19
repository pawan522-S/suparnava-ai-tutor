/**
 * Database connection module.
 * Uses PostgreSQL (pg) if DATABASE_URL is configured, otherwise
 * falls back to the existing JSON file-based storage so the app
 * works out-of-the-box with zero configuration.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'user_data');

// Ensure user_data directory exists (for file-based fallback)
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─────────────────────────────────────────────────────────────
// File-based storage helpers (always available as fallback)
// ─────────────────────────────────────────────────────────────

function _filePath(collection, id) {
    const safeId = String(id).replace(/[^a-zA-Z0-9_\-@.]/g, '_');
    return path.join(DATA_DIR, `${collection}_${safeId}.json`);
}

const fileDB = {
    /**
     * Save a document to a JSON file
     */
    save(collection, id, data) {
        fs.writeFileSync(_filePath(collection, id), JSON.stringify({ ...data, _id: id }, null, 2), 'utf-8');
        return { ...data, _id: id };
    },

    /**
     * Load a document by ID from a JSON file
     */
    load(collection, id) {
        const fp = _filePath(collection, id);
        if (!fs.existsSync(fp)) return null;
        try {
            return JSON.parse(fs.readFileSync(fp, 'utf-8'));
        } catch {
            return null;
        }
    },

    /**
     * Find a document by a field value (linear scan — suitable for small datasets)
     */
    findBy(collection, field, value) {
        const prefix = `${collection}_`;
        const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith(prefix) && f.endsWith('.json'));
        for (const file of files) {
            try {
                const doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
                if (doc[field] === value) return doc;
            } catch { /* skip */ }
        }
        return null;
    },

    /**
     * List all documents in a collection
     */
    list(collection) {
        const prefix = `${collection}_`;
        const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith(prefix) && f.endsWith('.json'));
        return files.map(file => {
            try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8')); }
            catch { return null; }
        }).filter(Boolean);
    },

    /**
     * Delete a document
     */
    delete(collection, id) {
        const fp = _filePath(collection, id);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
    },
};

// ─────────────────────────────────────────────────────────────
// PostgreSQL (optional — used when DATABASE_URL is set)
// ─────────────────────────────────────────────────────────────

let pgPool = null;

if (process.env.DATABASE_URL) {
    try {
        const { Pool } = require('pg');
        pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
        pgPool.query('SELECT 1').then(() => {
            console.log('[DB] ✅ PostgreSQL connected');
        }).catch(err => {
            console.warn('[DB] ⚠️  PostgreSQL connection failed, using file storage:', err.message);
            pgPool = null;
        });
    } catch {
        console.warn('[DB] pg module not installed, using file storage');
    }
}

/**
 * Execute a raw SQL query (only available when PostgreSQL is configured)
 */
async function query(sql, params = []) {
    if (!pgPool) throw new Error('PostgreSQL not configured. Set DATABASE_URL env var.');
    return pgPool.query(sql, params);
}

const isPostgres = () => pgPool !== null;

module.exports = { fileDB, query, isPostgres };
