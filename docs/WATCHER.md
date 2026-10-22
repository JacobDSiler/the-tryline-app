# Auto-deploy watcher

A tiny tray program, patterned on the Construction Passport watcher, that keeps
**The Tryline** live without you ever touching git or a terminal. It watches the
app's five web source files:

```
index.html  kitchen.html  specials.html  themes.js  markup-overlay.js
```

Whenever any of them changes (whether Claude edits them here, or you edit them
yourself), the watcher waits 20 seconds for things to settle — so a burst of
edits becomes one deploy, not five — then runs `deploy.cmd`, which:

1. Syncs the web source into `www/` (what the native app wrapper packages).
2. Publishes `www/` straight to the live Netlify site at
   `tryline-coffee-and-food.netlify.app`.
3. Commits and pushes to GitHub — that push is what triggers the GitHub
   Actions pipeline (`.github/workflows/release.yml`) that builds the
   iOS/Android apps and uploads them to TestFlight / the Play internal track.

**You never need to run `git push` yourself.** The only time you'd touch git by
hand is recovering from something unusual (a merge conflict, a reverted commit)
— the watcher doesn't try to be clever about those, it just leaves the retry
for next tick and tells you in the tray balloon.

## Install (one time)

Run **`start-watcher.cmd`** — this adds the watcher to Windows startup (tray,
no taskbar window) and starts it immediately.

From then on it runs at every login, sitting in the system tray (a coffee-cup
style icon — click the `^` arrow in the taskbar if you don't see it).
Right-click the tray icon for **Deploy now · Open watcher log · Open project
folder · Open live site · Quit**.

## How it behaves

- Polls the five source files every 10 seconds.
- On a change, waits 20 seconds of quiet before deploying (so saving several
  files in a row, or a multi-step edit, only triggers one deploy).
- Pops a tray notification when a deploy starts and when it's live.
- If a deploy fails (bad network, Netlify hiccup, git conflict), it leaves the
  "last deployed" marker where it was, so the very next tick retries
  automatically — nothing is lost, you just see a "will retry" balloon.
- `logs\watcher.log` has the full history if you (or Claude) ever need to see
  what happened and when.

## Stopping it

Run **`stop-watcher.cmd`** to kill the running tray process for this session.
It restarts again at your next login unless you also remove the shortcut from
your Startup folder.

## Requirements

Your PC on and logged in, and `web-netlify.json` present with valid Netlify
credentials (already set up). Git just needs to be authenticated the normal
way you already use on this machine — the watcher runs as you, so it pushes
with whatever credentials your own `git` already has cached.
