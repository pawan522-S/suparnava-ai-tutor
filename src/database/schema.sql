-- ============================================================
-- Suparnava AI English Tutor — PostgreSQL Database Schema
-- Run this file when using PostgreSQL (DATABASE_URL is set)
-- The app works without this using file-based storage
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    native_language VARCHAR(50) DEFAULT 'English',
    level           VARCHAR(20) DEFAULT 'beginner' CHECK (level IN ('beginner','intermediate','advanced')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- User Progress Profiles
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    xp              INTEGER DEFAULT 0,
    streak          INTEGER DEFAULT 0,
    last_streak_date DATE,
    message_count   INTEGER DEFAULT 0,
    total_correct   INTEGER DEFAULT 0,
    total_errors    INTEGER DEFAULT 0,
    correct_streak  INTEGER DEFAULT 0,
    lessons_completed INTEGER DEFAULT 0,
    perfect_scores  INTEGER DEFAULT 0,
    hindi_mode      BOOLEAN DEFAULT FALSE,
    badges          TEXT[] DEFAULT '{}',        -- array of badge IDs
    common_errors   TEXT[] DEFAULT '{}',        -- array of error type strings
    topics_practiced TEXT[] DEFAULT '{}',
    scenario_history TEXT[] DEFAULT '{}',
    last_interaction TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Sessions (conversation turns)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_text       TEXT NOT NULL,
    tutor_reply     TEXT,
    grammar_score   INTEGER,                    -- 0-100
    had_errors      BOOLEAN DEFAULT FALSE,
    error_types     TEXT[] DEFAULT '{}',
    topic           VARCHAR(100),
    scenario        VARCHAR(50),
    pronunciation_score INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Lessons
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
    id              VARCHAR(50) PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    icon            VARCHAR(10),
    level           VARCHAR(20) CHECK (level IN ('beginner','intermediate','advanced')),
    duration        INTEGER,                    -- minutes
    xp_reward       INTEGER DEFAULT 50,
    objective       TEXT,
    exercises       JSONB DEFAULT '[]',
    focus_area      VARCHAR(50),
    is_offline      BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Lesson Completions (many-to-many)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_completions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id       VARCHAR(50) NOT NULL REFERENCES lessons(id),
    xp_earned       INTEGER,
    completed_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, lesson_id)
);

-- ─────────────────────────────────────────────
-- Daily Challenges
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenges (
    id              VARCHAR(10) PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    prompt          TEXT NOT NULL,
    level           VARCHAR(20) CHECK (level IN ('beginner','intermediate','advanced')),
    xp_reward       INTEGER DEFAULT 75
);

-- ─────────────────────────────────────────────
-- Challenge Submissions
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenge_submissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_id    VARCHAR(10) NOT NULL REFERENCES challenges(id),
    response_text   TEXT NOT NULL,
    grammar_score   INTEGER,
    ai_feedback     TEXT,
    xp_earned       INTEGER,
    submitted_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Error Logs (for analytics)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS error_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id      UUID REFERENCES sessions(id) ON DELETE SET NULL,
    error_type      VARCHAR(50) NOT NULL,
    original_text   TEXT,
    corrected_text  TEXT,
    explanation     TEXT,
    logged_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Indexes for performance
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_user_id   ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created   ON sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_type    ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_completions_user   ON lesson_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_challenges_level   ON challenges(level);
