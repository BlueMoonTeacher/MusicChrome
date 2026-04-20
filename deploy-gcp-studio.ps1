# MusicChrome → GCP Cloud Storage (penguin-trip 프로젝트)
# PowerShell에서 실행: .\deploy-gcp-studio.ps1
# 전제: gcloud CLI 설치, `gcloud auth login`, 프로젝트에 결제·Storage API 사용 가능

$ErrorActionPreference = "Stop"
$ProjectId = "studio-9601779496-ecc69"
$Bucket = "studio-9601779496-musicchrome-piano"
$Region = "asia-northeast3"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "Project: $ProjectId"
Write-Host "Bucket:  gs://$Bucket"
gcloud config set project $ProjectId

gcloud storage buckets describe "gs://$Bucket" --format="value(name)" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Creating bucket..."
  gcloud storage buckets create "gs://$Bucket" `
    --location=$Region `
    --uniform-bucket-level-access `
    --project=$ProjectId
} else {
  Write-Host "Bucket already exists, skipping create."
}

Write-Host "Website config (index.html)..."
gcloud storage buckets update "gs://$Bucket" `
  --web-main-page-suffix=index.html `
  --web-error-page=index.html

Write-Host "npm ci && npm run build..."
npm ci
npm run build

Write-Host "Uploading dist/..."
gcloud storage rsync --recursive dist/ "gs://$Bucket/" --cache-control="public, max-age=300"

Write-Host "Public read (allUsers:objectViewer)..."
gcloud storage buckets add-iam-policy-binding "gs://$Bucket" `
  --member=allUsers `
  --role=roles/storage.objectViewer

$Url = "https://storage.googleapis.com/$Bucket/index.html"
Write-Host ""
Write-Host "Done. Open:" -ForegroundColor Green
Write-Host "  $Url"
Write-Host "  https://storage.googleapis.com/$Bucket/piano.html"
