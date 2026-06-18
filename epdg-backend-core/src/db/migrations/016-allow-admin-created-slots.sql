-- Allow admin-created internship slots without a company association
ALTER TABLE internship_slots ALTER COLUMN company_id DROP NOT NULL;

-- Track which admin created the slot
ALTER TABLE internship_slots ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
