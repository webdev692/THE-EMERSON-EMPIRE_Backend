import crypto from 'crypto';
import { getPool } from '../db';
import { getSupabase } from '../utils/supabaseClient';
import { generateCertificatePDF } from '../utils/certificatePdf';
import { logger } from '../utils/logger';
import { requireEnvironmentVariable } from '../config/env';

const CERT_BUCKET = 'certificates';

// ── Department code lookup ─────────────────────────────────────────────────
const DEPT_CODES: Record<string, string> = {
  'Frontend':         'FE',
  'Backend':          'BE',
  'Full Stack':       'FS',
  'UX/UI':            'UX',
  'Sales':            'SA',
  'Marketing':        'MK',
  'Social Media':     'SM',
  'Data & Analytics': 'DA',
  'HR & Admin':       'HR',
};

function deptCode(dept?: string | null): string {
  return dept ? (DEPT_CODES[dept] ?? 'GN') : 'GN';
}

// ── HMAC integrity hash ────────────────────────────────────────────────────
function computeHash(certNumber: string, internName: string, programName: string, issueDate: string): string {
  const secret = process.env.CERT_SIGNING_SECRET;
  if (!secret) throw new Error('CERT_SIGNING_SECRET env var is not set');
  return crypto
    .createHmac('sha256', secret)
    .update(`${certNumber}|${internName}|${programName}|${issueDate}`)
    .digest('hex');
}

// ── Sequential certificate number ─────────────────────────────────────────
async function nextCertNumber(dept: string | null, year: number): Promise<string> {
  const pool   = getPool();
  const code   = deptCode(dept);
  const prefix = `EPDG-${year}-${code}-`;
  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM certificates WHERE certificate_number LIKE $1`,
    [`${prefix}%`],
  );
  const seq = Number(rows[0].count) + 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// ── Ensure Supabase bucket exists ─────────────────────────────────────────
async function ensureBucket(): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.storage.createBucket(CERT_BUCKET, { public: true });
  if (error && !error.message.toLowerCase().includes('already exists')) {
    logger.error('certificates bucket creation failed:', error.message);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface IssuePayload {
  adminUserId:  number;
  internId:     number;
  templateId?:  number | null;
  programName?: string;
  issueDate?:   string; // YYYY-MM-DD override
}

export async function issueCertificate(payload: IssuePayload) {
  const pool = getPool();
  const { adminUserId, internId, templateId, issueDate } = payload;

  // 1. Fetch intern details
  const { rows: internRows } = await pool.query(
    `SELECT u.id, u.name, ip.department, ip.course
     FROM users u
     LEFT JOIN intern_profiles ip ON ip.user_id = u.id
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [internId],
  );
  const intern = internRows[0];
  if (!intern) throw new Error('Intern not found');

  // 2. Resolve template (use default if not specified)
  let resolvedTemplateId = templateId ?? null;
  if (!resolvedTemplateId) {
    const { rows: tpl } = await pool.query(
      `SELECT id FROM certificate_templates WHERE department IS NULL ORDER BY id LIMIT 1`,
    );
    resolvedTemplateId = tpl[0]?.id ?? null;
  }

  // 3. Build cert metadata
  const year        = new Date().getFullYear();
  const certNumber  = await nextCertNumber(intern.department, year);
  const issueDateFinal = issueDate ?? new Date().toISOString().split('T')[0];
  const programName = payload.programName?.trim()
    || `${intern.department ?? 'General'} Internship Programme`;

  // 4. Pre-generate UUID so QR URL is baked into the PDF
  const certId = crypto.randomUUID();

  // 5. Compute integrity hash
  const hash = computeHash(certNumber, intern.name, programName, issueDateFinal);

  // 6. Generate PDF
  const pdfBytes = await generateCertificatePDF({
    intern_name:        intern.name,
    program_name:       programName,
    issue_date:         issueDateFinal,
    certificate_number: certNumber,
    cert_id:            certId,
    frontend_url:       requireEnvironmentVariable('FRONTEND_URL').replace(/\/$/, ''),
  });

  // 7. Upload PDF to Supabase (fire-and-forget on failure)
  let pdfUrl: string | null = null;
  try {
    await ensureBucket();
    const sb       = getSupabase();
    const fileName = `${certNumber}.pdf`;
    const { error: uploadErr } = await sb.storage
      .from(CERT_BUCKET)
      .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (uploadErr) throw uploadErr;
    const { data: urlData } = sb.storage.from(CERT_BUCKET).getPublicUrl(fileName);
    pdfUrl = urlData.publicUrl;
  } catch (e: any) {
    logger.error('PDF upload failed (certificate still issued):', e.message);
  }

  // 8. Insert certificate row
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [cert] } = await client.query(
      `INSERT INTO certificates
         (id, certificate_number, intern_id, intern_name_snapshot, department_snapshot,
          program_name, issue_date, issued_by, template_id, pdf_url, integrity_hash, status)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
       RETURNING *`,
      [
        certId, certNumber, internId, intern.name, intern.department,
        programName, issueDateFinal, adminUserId, resolvedTemplateId,
        pdfUrl, hash,
      ],
    );
    await client.query('COMMIT');
    return cert;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function revokeCertificate(id: string) {
  const pool = getPool();
  const { rows: [cert] } = await pool.query(
    `UPDATE certificates SET status = 'revoked' WHERE id = $1::uuid RETURNING *`,
    [id],
  );
  if (!cert) throw new Error('Certificate not found');
  return cert;
}

export async function listCertificates(filters?: { department?: string; status?: string }) {
  const pool = getPool();
  const params: unknown[] = [];
  const conditions: string[] = [];
  let idx = 1;

  if (filters?.status) {
    conditions.push(`c.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.department) {
    conditions.push(`c.department_snapshot = $${idx++}`);
    params.push(filters.department);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT c.*, u.name AS intern_name_live, u.email AS intern_email,
            a.name AS issued_by_name
     FROM certificates c
     JOIN users u ON u.id = c.intern_id
     JOIN users a ON a.id = c.issued_by
     ${where}
     ORDER BY c.created_at DESC`,
    params,
  );
  return rows;
}

export async function listTemplates() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, name, department FROM certificate_templates ORDER BY id`,
  );
  return rows;
}

export async function verifyCertificate(id: string) {
  const pool = getPool();
  const { rows: [cert] } = await pool.query(
    `SELECT * FROM certificates WHERE id = $1::uuid`,
    [id],
  );
  if (!cert) return null;

  // Recompute hash to detect any DB-level tampering
  const issueStr = new Date(cert.issue_date).toISOString().split('T')[0];
  let expectedHash: string;
  try {
    expectedHash = computeHash(
      cert.certificate_number,
      cert.intern_name_snapshot,
      cert.program_name,
      issueStr,
    );
  } catch {
    // CERT_SIGNING_SECRET not configured on this env
    return { status: 'invalid' as const };
  }

  const storedBuf   = Buffer.from(cert.integrity_hash, 'hex');
  const expectedBuf = Buffer.from(expectedHash,         'hex');
  if (storedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(storedBuf, expectedBuf)) {
    return { status: 'invalid' as const };
  }

  // Return only safe public fields
  return {
    intern_name:        cert.intern_name_snapshot,
    program_name:       cert.program_name,
    issue_date:         issueStr,
    certificate_number: cert.certificate_number,
    status:             cert.status as 'active' | 'revoked',
  };
}
