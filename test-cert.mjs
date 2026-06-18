import fs from 'fs';

const BASE     = process.env.API_URL  || 'http://localhost:5000';
const EMAIL    = process.env.ADMIN_EMAIL || 'admin@theemersonempire.info';
const PASSWORD = process.env.ADMIN_PASS;

if (!PASSWORD) {
  console.error('❌  Set ADMIN_PASS env var first:');
  console.error('     ADMIN_PASS=yourpassword node test-cert.mjs');
  process.exit(1);
}

async function run() {
  console.log(`Testing against: ${BASE}\n`);
  console.log('── 1. Login as admin ──────────────────────────────────');
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, role: 'admin' }),
  });
  const loginData = await loginRes.json();
  if (!loginData.token) {
    console.error('Login failed:', loginData);
    return;
  }
  const token = loginData.token;
  console.log('✅ Logged in as:', loginData.user.name);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  console.log('\n── 2. Fetch approved interns ──────────────────────────');
  const internsRes = await fetch(`${BASE}/api/admin/users?role=intern&status=approved`, { headers });
  const internsData = await internsRes.json();
  if (!internsData.success || internsData.data.length === 0) {
    console.error('No approved interns found:', internsData);
    return;
  }
  const intern = internsData.data[0];
  console.log(`✅ Found ${internsData.data.length} approved intern(s)`);
  console.log(`   Using: ${intern.name} (id=${intern.id}, email=${intern.email})`);

  console.log('\n── 3. Fetch certificate templates ─────────────────────');
  const tplRes = await fetch(`${BASE}/api/admin/certificate-templates`, { headers });
  const tplData = await tplRes.json();
  if (!tplData.success) {
    console.error('Templates fetch failed:', tplData);
    return;
  }
  console.log(`✅ Templates available: ${tplData.data.map(t => `[${t.id}] ${t.name}`).join(', ')}`);

  console.log('\n── 4. Issue certificate ────────────────────────────────');
  const issueRes = await fetch(`${BASE}/api/admin/certificates`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      intern_id:    intern.id,
      program_name: 'Frontend Development Internship Programme',
      issue_date:   new Date().toISOString().split('T')[0],
    }),
  });
  const issueData = await issueRes.json();
  if (!issueData.success) {
    console.error('❌ Issue failed:', JSON.stringify(issueData, null, 2));
    return;
  }
  const cert = issueData.data;
  console.log('✅ Certificate issued!');
  console.log(`   Number : ${cert.certificate_number}`);
  console.log(`   ID     : ${cert.id}`);
  console.log(`   PDF URL: ${cert.pdf_url ?? '(no URL — upload may have failed)'}`);
  console.log(`   Hash   : ${cert.integrity_hash}`);

  console.log('\n── 5. Public verify endpoint ──────────────────────────');
  const verifyRes = await fetch(`${BASE}/api/verify/${cert.id}`);
  const verifyData = await verifyRes.json();
  if (verifyData.success) {
    const d = verifyData.data;
    console.log(`✅ Verify status: ${d.status}`);
    console.log(`   Intern : ${d.intern_name}`);
    console.log(`   Program: ${d.program_name}`);
    console.log(`   Date   : ${d.issue_date}`);
  } else {
    console.error('❌ Verify failed:', verifyData);
  }

  console.log('\n── 6. List all certificates ───────────────────────────');
  const listRes = await fetch(`${BASE}/api/admin/certificates`, { headers });
  const listData = await listRes.json();
  if (listData.success) {
    console.log(`✅ Total certificates in DB: ${listData.data.length}`);
  } else {
    console.error('❌ List failed:', listData);
  }

  if (cert.pdf_url) {
    console.log('\n── 7. Download PDF locally ────────────────────────────');
    const pdfRes = await fetch(cert.pdf_url);
    if (pdfRes.ok) {
      const buf = Buffer.from(await pdfRes.arrayBuffer());
      const outPath = `./test-cert-${cert.certificate_number}.pdf`;
      fs.writeFileSync(outPath, buf);
      console.log(`✅ PDF saved to: ${outPath}  (${buf.length} bytes)`);
    } else {
      console.error('❌ PDF download failed:', pdfRes.status, pdfRes.statusText);
    }
  }

  console.log('\n─────────────────────────────────────────────────────');
  console.log('DONE. Verify page URL:');
  console.log(`  https://epd-group.netlify.app/verify/${cert.id}`);
}

run().catch(console.error);
