-- Migration: add Google OAuth + local password auth columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id varchar UNIQUE;
