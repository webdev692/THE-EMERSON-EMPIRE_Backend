# ── Usage: .\make-cert.ps1 -Password "yourpassword" ──────────────────────────
param(
  [Parameter(Mandatory)][string]$Password,
  [string]$Email = "admin@theemersonempire.info",
  [string]$Base  = "http://localhost:5000"
)

$ErrorActionPreference = "Stop"

Write-Host "`n── 1. Login ────────────────────────────────────────────" -ForegroundColor Cyan
$login = Invoke-RestMethod -Uri "$Base/api/auth/login" -Method POST `
  -ContentType "application/json" `
  -Body (ConvertTo-Json @{ email = $Email; password = $Password; role = "admin" })

if (-not $login.token) { Write-Error "Login failed: $($login | ConvertTo-Json)"; exit 1 }
$token = $login.token
Write-Host "✅ Logged in as: $($login.user.name)" -ForegroundColor Green

$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

Write-Host "`n── 2. Find active interns ──────────────────────────────" -ForegroundColor Cyan
$users = Invoke-RestMethod -Uri "$Base/api/admin/users?role=intern&status=approved" -Headers $headers
if ($users.data.Count -eq 0) { Write-Error "No approved interns found."; exit 1 }

Write-Host "Found $($users.data.Count) approved intern(s):" -ForegroundColor Green
$users.data | ForEach-Object { Write-Host "  id=$($_.id)  $($_.name)  <$($_.email)>" }

$intern = $users.data[0]
Write-Host "`nUsing: $($intern.name) (id=$($intern.id))" -ForegroundColor Yellow

Write-Host "`n── 3. Issue certificate ───────────────────────────────" -ForegroundColor Cyan
$body = ConvertTo-Json @{
  intern_id    = $intern.id
  program_name = "Emerson Professional Development Programme"
  issue_date   = (Get-Date -Format "yyyy-MM-dd")
}
$cert = Invoke-RestMethod -Uri "$Base/api/admin/certificates" -Method POST -Headers $headers -Body $body

Write-Host "✅ Certificate issued!" -ForegroundColor Green
Write-Host "   Number : $($cert.data.certificate_number)"
Write-Host "   ID     : $($cert.data.id)"
Write-Host "   Status : $($cert.data.status)"
Write-Host "   Hash   : $($cert.data.integrity_hash)"

if ($cert.data.pdf_url) {
  Write-Host "   PDF    : $($cert.data.pdf_url)" -ForegroundColor Cyan
  # Download PDF locally
  $outFile = ".\cert-$($cert.data.certificate_number).pdf"
  Invoke-WebRequest -Uri $cert.data.pdf_url -OutFile $outFile
  Write-Host "✅ PDF saved to: $outFile" -ForegroundColor Green
} else {
  Write-Host "   PDF    : (not uploaded — Supabase may need CERT bucket or env vars)" -ForegroundColor Yellow
}

Write-Host "`n── 4. Verify the certificate ──────────────────────────" -ForegroundColor Cyan
$verify = Invoke-RestMethod -Uri "$Base/api/verify/$($cert.data.id)"
Write-Host "   Status : $($verify.data.status)"
Write-Host "   Intern : $($verify.data.intern_name)"
Write-Host "   Program: $($verify.data.program_name)"

Write-Host "`n─────────────────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host "Public verify URL:" -ForegroundColor White
Write-Host "  http://localhost:5173/verify/$($cert.data.id)" -ForegroundColor Yellow
Write-Host ""
