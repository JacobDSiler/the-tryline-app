# =============================================================================
# The Tryline - deploy on every change.
#
# The central watcher (google-play-console-management\watcher.ps1) runs this
# any time a file changes anywhere under this project (fileChange mode). It:
#
#   1) Refreshes www/ from the root web source (index.html, kitchen.html,
#      specials.html, themes.js, markup-overlay.js) - same files Netlify
#      serves and what Capacitor packages into the native apps.
#   2) Publishes www/ straight to the live Netlify demo site, so Sam & the
#      client always see the latest version at tryline-coffee-and-food.netlify.app.
#   3) Commits + pushes to GitHub. That push is what makes the GitHub Actions
#      pipeline (.github/workflows/release.yml) build the iOS + Android apps
#      and upload them to TestFlight / the Play Console internal track - so
#      "save a change here" is the entire release process end to end.
#
# Nothing here touches production listings - TestFlight and the Play internal
# track are both private, review-before-promote tracks. Promoting a build to
# real customers is still a manual step in each console.
# =============================================================================
$ErrorActionPreference = "Continue"
$here = $PSScriptRoot
Set-Location $here
$log = Join-Path $here "logs\deploy.log"
New-Item -ItemType Directory -Force -Path (Join-Path $here "logs") | Out-Null
function Log($m){ $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m; Write-Host $line; Add-Content $log $line }

Log "=== deploy start ==="

# 1) Sync web source -> www/
Log "Syncing web assets into www/..."
cmd /c "npm run sync:web" 2>&1 | ForEach-Object { Log $_ }

# 2) Publish www/ to Netlify, if we have real credentials for this project
$netCfg = $null
foreach ($p in @((Join-Path $here "web-netlify.json"), "C:\dev\google-play-console-management\web-netlify.json")) {
  if (Test-Path $p) { try { $netCfg = Get-Content $p -Raw | ConvertFrom-Json; } catch {}; if ($netCfg -and $netCfg.siteId -eq "92d162d9-fc8e-4e1e-8014-9bc813dd5d73") { break } }
}
$haveCreds = $netCfg -and $netCfg.authToken -and $netCfg.siteId -and ($netCfg.authToken -notmatch 'PASTE') -and ($netCfg.siteId -notmatch 'PASTE')
if ($haveCreds) {
  Log "Deploying www/ to Netlify site $($netCfg.siteId)..."
  cmd /c "npx --yes netlify-cli deploy --prod --dir www --auth $($netCfg.authToken) --site $($netCfg.siteId)" 2>&1 | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -eq 0) { Log "Netlify deploy OK." } else { Log "Netlify deploy FAILED - check web-netlify.json." }
} else {
  Log "No web-netlify.json credentials found - skipping Netlify deploy."
}

# 3) Commit + push -> triggers the GitHub Actions store pipeline
Log "Checking for changes to commit..."
cmd /c "git add -A" 2>&1 | ForEach-Object { Log $_ }
$status = cmd /c "git status --porcelain"
if ($status) {
  $msg = "auto: sync " + (Get-Date -Format "yyyy-MM-dd HH:mm")
  cmd /c "git commit -m `"$msg`"" 2>&1 | ForEach-Object { Log $_ }
  Log "Pushing to GitHub (triggers iOS/Android build + store upload)..."
  cmd /c "git push origin main" 2>&1 | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -eq 0) { Log "Pushed. GitHub Actions will build + upload to TestFlight / Play internal track." }
  else { Log "git push FAILED - check 'git remote -v' and that origin/main is set up (see SETUP.md step 1)." }
} else {
  Log "Nothing to commit (only www/ changed, which is gitignored) - Netlify is up to date; no native rebuild needed."
}

Log "=== deploy done ==="
