-- Certificate templates
CREATE TABLE IF NOT EXISTS certificate_templates (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(100) NOT NULL,
    department          VARCHAR(100),                    -- NULL = applies to all departments
    background_image_url TEXT,
    field_positions     JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default template seed (idempotent)
INSERT INTO certificate_templates (name, department, background_image_url, field_positions)
SELECT
    'Default EPDG Template',
    NULL,
    NULL,
    '{
        "intern_name":        {"x": 416, "y": 390, "font_size": 30, "color": "#2C1654", "align": "center"},
        "program_name":       {"x": 416, "y": 317, "font_size": 18, "color": "#4B1E91", "align": "center"},
        "issue_date":         {"x": 416, "y": 280, "font_size": 10, "color": "#646464", "align": "center"},
        "certificate_number": {"x": 90,  "y": 104, "font_size": 11, "color": "#2C1654", "align": "left"},
        "qr_code":            {"x": 698, "y": 28,  "size": 108}
    }'::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM certificate_templates WHERE name = 'Default EPDG Template'
);

-- Issued certificates
CREATE TABLE IF NOT EXISTS certificates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_number    VARCHAR(50)  UNIQUE NOT NULL,
    intern_id             INTEGER      NOT NULL REFERENCES users(id),
    intern_name_snapshot  VARCHAR(200) NOT NULL,
    department_snapshot   VARCHAR(100),
    program_name          VARCHAR(200) NOT NULL,
    issue_date            DATE         NOT NULL DEFAULT CURRENT_DATE,
    issued_by             INTEGER      NOT NULL REFERENCES users(id),
    template_id           INTEGER      REFERENCES certificate_templates(id),
    pdf_url               TEXT,
    integrity_hash        VARCHAR(64)  NOT NULL,
    status                VARCHAR(20)  NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'revoked')),
    created_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
