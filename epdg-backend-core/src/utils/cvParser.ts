import pdfParse from 'pdf-parse';
import { extractSkills, ExtractedSkills } from './skillExtractor';
import { requireEnvironmentVariable } from '../config/env';

const MAX_CV_BYTES = 5 * 1024 * 1024;

export function isAllowedCvUrl(cvUrl: string, supabaseUrl: string): boolean {
  try {
    const candidate = new URL(cvUrl);
    const storage = new URL(supabaseUrl);
    return candidate.protocol === 'https:' &&
      candidate.origin === storage.origin &&
      candidate.pathname.startsWith('/storage/v1/object/');
  } catch {
    return false;
  }
}

export async function parseCvFromUrl(cvUrl: string): Promise<{ text: string; skills: ExtractedSkills } | null> {
  try {
    const supabaseUrl = requireEnvironmentVariable('SUPABASE_URL');
    if (!isAllowedCvUrl(cvUrl, supabaseUrl)) return null;

    const response = await fetch(cvUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_CV_BYTES) return null;

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_CV_BYTES) return null;

    let text = '';
    if (contentType.includes('application/pdf') || cvUrl.toLowerCase().includes('.pdf')) {
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } else if (contentType.startsWith('text/')) {
      text = buffer.toString('utf-8');
    } else {
      return null;
    }

    const skills = extractSkills(text);
    return { text, skills };
  } catch {
    return null;
  }
}
