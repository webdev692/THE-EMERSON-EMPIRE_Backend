import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, degrees } from 'pdf-lib';
import QRCode from 'qrcode';

export interface CertPdfData {
  intern_name:        string;
  program_name:       string;
  issue_date:         string; // YYYY-MM-DD
  certificate_number: string;
  cert_id:            string; // UUID used in QR URL
  frontend_url:       string;
}

// ── helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Reduce font size until text fits within maxWidth (minimum 8pt). */
function fitSize(text: string, font: PDFFont, preferred: number, maxWidth: number): number {
  let s = preferred;
  while (font.widthOfTextAtSize(text, s) > maxWidth && s > 8) s -= 1;
  return s;
}

/** Draw text horizontally centred at (cx, y). */
function drawCentered(
  page: PDFPage, text: string, cx: number, y: number,
  font: PDFFont, size: number, color: ReturnType<typeof rgb>,
) {
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - tw / 2, y, size, font, color });
}

// ── main export ────────────────────────────────────────────────────────────

export async function generateCertificatePDF(data: CertPdfData): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();

  // A4 Landscape (points)
  const W = 841.89;
  const H = 595.28;
  const page = doc.addPage([W, H]);

  // Embed standard fonts (no external files needed)
  const fReg  = await doc.embedFont(StandardFonts.Helvetica);
  const fBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fObl  = await doc.embedFont(StandardFonts.HelveticaOblique);

  // ── Palette ───────────────────────────────────────────────────────────────
  const clPurple = rgb(75  / 255, 30  / 255, 145 / 255); // #4B1E91
  const clDark   = rgb(44  / 255, 22  / 255, 84  / 255); // #2C1654
  const clGold   = rgb(201 / 255, 168 / 255, 76  / 255); // #C9A84C
  const clGray   = rgb(100 / 255, 100 / 255, 100 / 255);
  const clWhite  = rgb(1, 1, 1);

  // Content x-center (between left bar and right border)
  const cx = 70 + (W - 90) / 2; // ≈ 416

  // ── Background + borders ──────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: clWhite });

  // Left purple bar
  page.drawRectangle({ x: 0, y: 0, width: 70, height: H, color: clPurple });

  // Gold top stripe
  page.drawRectangle({ x: 70, y: H - 24, width: W - 90, height: 5, color: clGold });

  // Gold bottom stripe
  page.drawRectangle({ x: 70, y: 17, width: W - 90, height: 5, color: clGold });

  // Thin right purple border
  page.drawRectangle({ x: W - 22, y: 22, width: 5, height: H - 44, color: clPurple });

  // Small white "EPDG" text on sidebar (left bar)
  const sideLabel = 'EPDG';
  const sideSz    = 13;
  const sideTw    = fBold.widthOfTextAtSize(sideLabel, sideSz);
  page.drawText(sideLabel, {
    x: 28,
    y: H / 2 - sideTw / 2,
    size:  sideSz,
    font:  fBold,
    color: rgb(1, 1, 1),
    rotate: degrees(90),
  });

  // ── Helper: thin gold rule ──
  const rule = (y: number) =>
    page.drawLine({ start: { x: 120, y }, end: { x: W - 45, y }, thickness: 1, color: clGold });

  // ── Branding ──────────────────────────────────────────────────────────────
  drawCentered(page, 'THE EMERSON EMPIRE', cx, H - 46, fBold, 12, clPurple);
  drawCentered(page, 'Professional Development Group', cx, H - 62, fReg, 9, clGray);
  rule(H - 74);

  // ── Title ─────────────────────────────────────────────────────────────────
  drawCentered(page, 'CERTIFICATE OF COMPLETION', cx, H - 112, fBold, 26, clDark);
  rule(H - 130);

  // ── Body ──────────────────────────────────────────────────────────────────
  drawCentered(page, 'This certifies that', cx, H - 158, fObl, 11, clGray);

  const nameText = data.intern_name.toUpperCase();
  const nameSz   = fitSize(nameText, fBold, 30, W - 160);
  drawCentered(page, nameText, cx, H - 205, fBold, nameSz, clDark);

  drawCentered(page, 'has successfully completed the program in', cx, H - 245, fReg, 10, clGray);

  const progSz = fitSize(data.program_name, fBold, 18, W - 160);
  drawCentered(page, data.program_name, cx, H - 278, fBold, progSz, clPurple);

  drawCentered(page, `Issued on ${formatDate(data.issue_date)}`, cx, H - 315, fReg, 10, clGray);

  rule(H - 332);

  // ── Signature area ────────────────────────────────────────────────────────
  const sigY = H - 420;
  page.drawLine({ start: { x: 105, y: sigY }, end: { x: 255, y: sigY }, thickness: 1, color: clGold });
  page.drawText('Authorized Director',    { x: 105, y: sigY - 14, size: 8, font: fReg, color: clGray });

  page.drawLine({ start: { x: 480, y: sigY }, end: { x: 630, y: sigY }, thickness: 1, color: clGold });
  page.drawText('Programme Coordinator', { x: 480, y: sigY - 14, size: 8, font: fReg, color: clGray });

  // ── Bottom section ────────────────────────────────────────────────────────
  // Certificate number + verify URL (left of QR)
  page.drawText('Certificate No:', { x: 90, y: 118, size: 8,  font: fReg,  color: clGray  });
  page.drawText(data.certificate_number, { x: 90, y: 104, size: 11, font: fBold, color: clDark });

  const verifyUrl = `${data.frontend_url}/verify/${data.cert_id}`;
  page.drawText('Verify authenticity at:', { x: 90, y: 85, size: 7.5, font: fReg, color: clGray });
  page.drawText(verifyUrl,                  { x: 90, y: 73, size: 7,   font: fReg, color: clGray });

  // ── QR Code ───────────────────────────────────────────────────────────────
  const qrBuf = await QRCode.toBuffer(verifyUrl, { type: 'png', width: 140, margin: 1 });
  const qrImg = await doc.embedPng(qrBuf);
  page.drawImage(qrImg, { x: 698, y: 28, width: 108, height: 108 });

  const scanLabel = 'Scan to verify';
  const scanTw    = fReg.widthOfTextAtSize(scanLabel, 7.5);
  page.drawText(scanLabel, { x: 698 + 54 - scanTw / 2, y: 22, size: 7.5, font: fReg, color: clGray });

  return doc.save();
}
