# The Tryline app — native build & store setup

This repo wraps the live web app (`index.html`, `kitchen.html`, `specials.html`)
in Capacitor so it can ship as a real iOS and Android app, with a GitHub
Actions pipeline (`.github/workflows/release.yml`) that builds both and
uploads them automatically whenever you push a version tag.

**Source of truth:** edit `index.html` / `kitchen.html` / `specials.html` /
`themes.js` / `markup-overlay.js` at the repo root (the same files deployed to
Netlify). Never edit anything under `www/` directly — `npm run sync:web`
regenerates it, and `npm run cap:sync` runs that plus `npx cap sync` to push
the latest web code into the native Android/iOS projects.

The markup/feedback button is now skipped automatically inside the native
app build (it still shows on the Netlify web demo) — real customers in the
App Store / Play Store will never see Sam & Jacob's internal review tool.

## 1. Push this to GitHub

```
cd "C:\dev\Client Work\tryline-coffee-and-food"
git remote add origin https://github.com/JacobDSiler/the-tryline-app.git
git add -A
git commit -m "Capacitor wrapper + CI/CD scaffolding"
git push -u origin main
```

(Create the empty, **private** repo `the-tryline-app` under your GitHub
account first — github.com → New repository — since the token this session
has doesn't have permission to create repos for you.)

## 2. App icons & splash screen

Right now the app uses Capacitor's placeholder icon. Once you've got a
square Tryline logo (navy #14304a background, red #d81f35 accent — ideally
1024×1024 PNG), generate real icons with:

```
npm install -D @capacitor/assets
npx capacitor-assets generate --iconBackgroundColor '#14304a' --splashBackgroundColor '#14304a'
```

## 3. Google Play Console — Prime Management org account

Google Play requires a **D-U-N-S number** to register a new *organization*
developer account (same requirement for converting an existing personal
account to organization status) — this is Dun & Bradstreet's free business ID
lookup/registration, and can take a few days if Prime Management doesn't
already have one. Steps:

1. Look up or register a free D-U-N-S number for Prime Management at
   https://www.dnb.com/duns-number/get-a-duns.html (search first — many Irish
   businesses already have one even if unregistered by the owner).
2. At https://play.google.com/console/signup, choose **Organization** (not
   Individual), and register with Prime Management's legal name, the D-U-N-S
   number, and the business address.
3. Pay the one-time $25 registration fee — this is the step that needs
   Sam's go-ahead on the company card (see the WhatsApp message below).
4. Once approved, create the app listing (package name
   `com.primemanagement.tryline`) and go to **Setup → API access** to create
   a service account, then **Users and permissions** to grant it Release
   Manager access. Download its JSON key — that becomes the
   `PLAY_SERVICE_ACCOUNT_JSON` GitHub secret below.

Converting your *existing* personal Play account to an organization isn't
offered directly in the Play Console UI; Google's current guidance is to
register a new organization account rather than convert, which is what's
outlined above.

## 4. Apple Developer Program — Prime Management org account

Apple's Developer Program also requires a D-U-N-S number for an
**Organization** account (same lookup as step 3) and a yearly $99 fee —
again, the card approval in the WhatsApp message below covers this.

1. At https://developer.apple.com/enroll/, enroll as **Organization**.
2. Apple verifies you have legal authority to bind Prime Management (they
   may call the business or request documents) — this step can take a few
   business days.
3. Once enrolled, go to **Users and Access → Integrations → App Store
   Connect API** and generate an API key with the **App Manager** role.
   Download the `.p8` key, and note the Key ID and Issuer ID — these become
   `ASC_KEY_CONTENT`, `ASC_KEY_ID`, and `ASC_ISSUER_ID` below.
4. Create the app record in App Store Connect with bundle ID
   `com.primemanagement.tryline`.

## 5. Android signing key

```
keytool -genkey -v -keystore release.keystore -alias tryline -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore > release.keystore.b64   # paste this into the GitHub secret below
```
Keep `release.keystore` somewhere safe outside the repo — losing it means
you can never update the Play Store listing under the same app again.

## 6. iOS signing certificate & provisioning profile

Easiest from a Mac with Xcode signed into the Prime Management Apple ID:
Xcode → Settings → Accounts → Manage Certificates → create an "Apple
Distribution" certificate, then export it as a `.p12` from Keychain Access
(with a password). Create an App Store provisioning profile for
`com.primemanagement.tryline` in the Apple Developer portal. Base64-encode
both the same way as the Android keystore above.

## 7. GitHub Actions secrets

Add these under the repo's **Settings → Secrets and variables → Actions**:

| Secret | From step |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | 5 |
| `ANDROID_KEYSTORE_PASSWORD` | 5 (the password you set) |
| `ANDROID_KEY_ALIAS` | 5 (`tryline` above) |
| `ANDROID_KEY_PASSWORD` | 5 |
| `PLAY_SERVICE_ACCOUNT_JSON` | 3 |
| `IOS_CERTIFICATE_P12` | 6 |
| `IOS_CERTIFICATE_PASSWORD` | 6 |
| `IOS_KEYCHAIN_PASSWORD` | any password — used only to create a temporary CI keychain |
| `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_KEY_CONTENT` | 4 |
| `APPLE_TEAM_ID` | Apple Developer portal → Membership |

## 8. Ship a release

```
git tag v1.0.0
git push --tags
```
GitHub Actions then builds and uploads Android to the Play Console
**internal testing** track and iOS to **TestFlight** automatically. Promote
to production from each console once you're happy with a build — that step
is deliberately manual so nothing goes live to real customers unreviewed.

## 9. The watcher — auto-deploy on every change

This project is registered with your central project watcher
(`C:\dev\google-play-console-management\apps.json`, id
`tryline-coffee-and-food`). Any time a file changes here (outside
`www/`/`android`/`ios` build output), the watcher runs `deploy.cmd`, which:

1. Refreshes `www/` from the root source files.
2. Publishes `www/` straight to the live Netlify demo
   (tryline-coffee-and-food.netlify.app) — using the `web-netlify.json`
   sitting in this folder (gitignored; copied from the central one, with
   this project's own site ID).
3. Commits and pushes to GitHub if there's a real change outside `www/` —
   that push is what makes GitHub Actions build the iOS/Android apps and
   upload them to TestFlight / the Play Console internal track.

So once step 1 (push this repo to GitHub) and the store secrets
(steps 3–7) are done, the whole loop is: **edit a file here → save → within
a few seconds it's live on Netlify, on GitHub, and a new build is on its
way to TestFlight and Play's internal testing track.** Check
`logs\deploy.log` here, or `C:\dev\google-play-console-management\logs\watcher.log`,
if a run doesn't seem to have happened.

Until the GitHub repo exists (step 1) and the store secrets are added
(steps 3–7), the watcher will still deploy to Netlify fine, but the
`git push` and the GitHub Actions store upload will fail — check
`logs\deploy.log` for "git push FAILED" and the repo's Actions tab for
build errors. Nothing here is silently broken; it's just waiting on those
one-time account/setup steps.
