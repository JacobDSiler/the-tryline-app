@echo off
REM Sync web assets, push the live demo to Netlify, and push to GitHub so the
REM CI/CD pipeline builds + uploads the iOS/Android apps to their stores.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
