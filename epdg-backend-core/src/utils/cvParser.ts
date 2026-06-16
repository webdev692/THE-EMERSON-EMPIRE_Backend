import pdfParse from 'pdf-parse';
import { extractSkills, ExtractedSkills } from './skillExtractor';

export async function parseCvFromUrl(cvUrl: string): Promise<{ text: string; skills: ExtractedSkills } | null> {
  try {
    const response = await fetch(cvUrl);
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    const buffer = Buffer.from(await response.arrayBuffer());

    let text = '';

    if (contentType.includes('pdf') || cvUrl.toLowerCase().endsWith('.pdf')) {
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } else {
      text = buffer.toString('utf-8');
    }

    const skills = extractSkills(text);
    return { text, skills };
  } catch {
    return null;
  }
}
