-- EPDG Backend Auth Tables Migration
-- Run this SQL in your Supabase SQL editor or against your PostgreSQL database

-- =============================================
-- 1. ENUM TYPES
-- =============================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'company', 'intern', 'school');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE school_type AS ENUM ('university', 'college', 'polytechnic', 'tvet');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- 2. USERS TABLE (main auth table)
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(150) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'intern',
  is_verified BOOLEAN DEFAULT FALSE,
  verification_token VARCHAR(255),
  token_expires_at TIMESTAMP,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);

-- =============================================
-- 3. COMPANIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(150) NOT NULL,
  email VARCHAR(150),
  country VARCHAR(100),
  county VARCHAR(100),
  industry VARCHAR(100),
  number_of_employees INTEGER,
  registration_number VARCHAR(100),
  website VARCHAR(255),
  logo_url VARCHAR(500),
  description TEXT,
  contact_person VARCHAR(100),
  contact_phone VARCHAR(20),
  is_verified BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMP,
  approved_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_companies_user_id ON companies(user_id);

-- =============================================
-- 4. SCHOOLS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS schools (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_name VARCHAR(150) NOT NULL,
  email VARCHAR(150),
  school_type school_type DEFAULT 'university',
  county VARCHAR(100),
  address TEXT,
  website VARCHAR(255),
  logo_url VARCHAR(500),
  contact_person VARCHAR(100),
  contact_phone VARCHAR(20),
  courses_offered JSON,
  is_verified BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMP,
  approved_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_schools_user_id ON schools(user_id);

-- =============================================
-- 5. INTERN PROFILES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS intern_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id INTEGER REFERENCES schools(id),
  course VARCHAR(150),
  year_of_study SMALLINT,
  contact_phone VARCHAR(20),
  cv_url VARCHAR(500),
  skills JSON,
  bio TEXT,
  availability_start DATE,
  availability_end DATE,
  nda_signed BOOLEAN DEFAULT FALSE,
  disclaimer_accepted BOOLEAN DEFAULT FALSE,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intern_profiles_user_id ON intern_profiles(user_id);
