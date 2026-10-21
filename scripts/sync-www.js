// Copies the deployed web source (root of this repo — same files pushed to
// Netlify) into www/, the folder Capacitor packages into the native app.
// Run via `npm run sync:web` (or `npm run cap:sync`, which also runs
// `npx cap sync` after). Keeps a single source of truth: edit index.html /
// kitchen.html / specials.html / themes.js / markup-overlay.js at the repo
// root, never inside www/ directly.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WWW = path.join(ROOT, "www");
const FILES = ["index.html", "kitchen.html", "specials.html", "markup-overlay.js", "themes.js"];

fs.mkdirSync(WWW, { recursive: true });
for (const f of FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) { console.warn("skip (not found):", f); continue; }
  fs.copyFileSync(src, path.join(WWW, f));
  console.log("synced", f);
}
