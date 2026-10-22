# The Tryline - tray watcher (auto web deploy + git push).
#   Watches the app's web source files (index.html, kitchen.html, specials.html,
#   themes.js, markup-overlay.js). Whenever any of them changes, it debounces
#   briefly (so a burst of edits becomes one deploy, not several) then runs
#   deploy.cmd, which syncs www/, publishes to Netlify, and commits + pushes
#   to GitHub -- the push is what triggers the GitHub Actions pipeline that
#   builds the iOS/Android apps and uploads them to TestFlight / Play internal.
# Lives in the system tray with NO taskbar or console window. Right-click for options.
$ErrorActionPreference = "Continue"
$here = $PSScriptRoot
Set-Location $here

# --- Crash-proof startup: create the log dir and a trap FIRST, so any failure
# during init is written to logs\watcher.log (readable) instead of dying silently
# in a hidden window. In debug mode it also pops a message box and holds open. ---
$bootLogDir = Join-Path $here "logs"
if (-not (Test-Path $bootLogDir)) { New-Item -ItemType Directory -Path $bootLogDir -Force | Out-Null }
$bootLog = Join-Path $bootLogDir "watcher.log"
function BootLog($m){ try { Add-Content $bootLog ("{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m) } catch {} }
trap {
  BootLog ("FATAL: " + $_.Exception.Message)
  BootLog ("STACK: " + $_.ScriptStackTrace)
  if ($env:TL_WATCH_DEBUG) {
    try { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Tryline watcher failed to start") | Out-Null } catch {}
  }
  break
}
BootLog "==== process launched (initialising) ===="

# Single-instance guard: a named mutex so launching the watcher twice (e.g. via
# both the Startup shortcut and a manual run) never produces two deployers racing.
$script:__tlMutex = New-Object System.Threading.Mutex($false, 'Global\TheTrylineWatcher')
$gotIt = $false
try { $gotIt = $script:__tlMutex.WaitOne(0) } catch { $gotIt = $true }
if (-not $gotIt) { BootLog "another watcher instance is already running - this one is exiting"; return }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Hide our own console window -> tray only.
$sig = @'
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'@
# Set TL_WATCH_DEBUG=1 to keep the console visible (to see errors); otherwise hide to tray.
if (-not $env:TL_WATCH_DEBUG) { try { $w = Add-Type -MemberDefinition $sig -Name "Win" -Namespace "Tl" -PassThru; $w::ShowWindow($w::GetConsoleWindow(), 0) | Out-Null } catch {} }

$logDir  = Join-Path $here "logs"
$logFile = Join-Path $logDir "watcher.log"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
function Log($m){ try { Add-Content $logFile ("{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m) } catch {} }

# The files that define a "deploy-worthy" change. Anything else in the project
# (docs, scripts, logs, native wrapper folders) is left alone -- editing one of
# these is what "ship it" means for this app.
$watchedFiles = @("index.html","kitchen.html","specials.html","themes.js","markup-overlay.js")
$stateFile = Join-Path $logDir "last-deployed.txt"

function Get-WatchedMtime {
  $latest = [DateTime]::MinValue
  foreach ($f in $watchedFiles) {
    $p = Join-Path $here $f
    if (Test-Path $p) { $m = (Get-Item $p).LastWriteTimeUtc; if ($m -gt $latest) { $latest = $m } }
  }
  return $latest
}
function Get-LastDeployed {
  if (Test-Path $stateFile) {
    try { return [DateTime]::Parse((Get-Content $stateFile -Raw).Trim(), [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::RoundtripKind) } catch {}
  }
  return [DateTime]::MinValue
}
function Set-LastDeployed($dt) { try { Set-Content $stateFile $dt.ToString("o") } catch {} }

$notify = New-Object System.Windows.Forms.NotifyIcon
$iconPath = Join-Path $here "watcher.ico"
# Load the icon robustly: try a crisp 32x32 frame first, then the default
# frame, then fall back to a system icon only if the file is missing/unreadable.
$ico = $null
if (Test-Path $iconPath) {
  try { $ico = New-Object System.Drawing.Icon($iconPath, 32, 32) } catch {}
  if (-not $ico) { try { $ico = New-Object System.Drawing.Icon($iconPath) } catch {} }
}
if (-not $ico) { $ico = [System.Drawing.SystemIcons]::Application }
$notify.Icon = $ico
$notify.Text = "The Tryline - auto deploy watcher"
$notify.Visible = $true
function Balloon($title,$msg){ try { $notify.BalloonTipTitle=$title; $notify.BalloonTipText=$msg; $notify.ShowBalloonTip(8000) } catch {} }

# Wait for a child process WITHOUT freezing the tray menu (keeps pumping UI messages).
function Wait-Responsive($p) {
  while (-not $p.HasExited) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 100 }
}

$script:busy = $false
$script:pendingSince = $null
$script:DebounceSeconds = 20
$script:lastSeenMtime = Get-WatchedMtime

function Check {
  if ($script:busy) { return }
  $script:busy = $true
  try {
    $current = Get-WatchedMtime
    $lastDeployed = Get-LastDeployed

    if ($current -gt $script:lastSeenMtime) {
      # Something changed since we last looked -- (re)start the debounce clock.
      $script:lastSeenMtime = $current
      $script:pendingSince = Get-Date
      Log "change detected, debouncing $($script:DebounceSeconds)s..."
      return
    }

    if ($script:pendingSince -and ((Get-Date) - $script:pendingSince).TotalSeconds -ge $script:DebounceSeconds -and $current -gt $lastDeployed) {
      $script:pendingSince = $null
      Balloon "Deploying The Tryline" "Publishing the latest changes..."
      Log "deploying: sync + netlify + git push..."
      $ok = $false
      try {
        $p = Start-Process powershell -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File","`"$here\deploy.ps1`"","auto" -WorkingDirectory $here -WindowStyle Hidden -PassThru
        Wait-Responsive $p
        $ok = ($p.ExitCode -eq 0 -or $null -eq $p.ExitCode)
        Log "deploy.ps1 exit=$($p.ExitCode)"
      } catch { Log "EXCEPTION $_" }
      if ($ok) {
        Set-LastDeployed $current
        Balloon "The Tryline is live" "tryline-coffee-and-food.netlify.app updated, and pushed to GitHub."
        Log "DONE (marker advanced)"
      } else {
        Balloon "Deploy failed - will retry" "See logs\watcher.log."
        Log "FAILED - marker left so it retries next tick"
      }
    }
  } catch { Log "check: EXCEPTION $_" } finally { $script:busy = $false }
}

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$header = $menu.Items.Add("The Tryline watcher")
$header.Enabled = $false
$header.Font = New-Object System.Drawing.Font($header.Font, [System.Drawing.FontStyle]::Bold)
$menu.Items.Add("-") | Out-Null
($menu.Items.Add("Deploy now")).add_Click({ $script:pendingSince = (Get-Date).AddSeconds(-$script:DebounceSeconds); $script:lastSeenMtime = Get-WatchedMtime; Log "menu: deploy now requested"; Check })
($menu.Items.Add("Open watcher log")).add_Click({ if (Test-Path $logFile) { Start-Process notepad.exe $logFile } else { Balloon "No log yet" "The watcher hasn't logged anything yet." } })
($menu.Items.Add("Open project folder")).add_Click({ Start-Process explorer.exe $here })
($menu.Items.Add("Open live site")).add_Click({ Start-Process "https://tryline-coffee-and-food.netlify.app" })
$menu.Items.Add("-") | Out-Null
($menu.Items.Add("Quit watcher")).add_Click({ $notify.Visible = $false; [System.Windows.Forms.Application]::Exit() })
$notify.ContextMenuStrip = $menu
# Double-clicking the tray icon runs a check immediately.
$notify.add_MouseDoubleClick({ Check })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 10000
$timer.add_Tick({ Check })
$timer.Start()

# ---- Heartbeat: proves this watcher instance is alive (start-watcher.ps1 waits for it; the linked
# chat can read logs\heartbeat.txt to see whether the watcher is running and which version of itself).
$script:hbPath = Join-Path $logDir "heartbeat.txt"
function Heartbeat {
  try {
    $v = ""; try { $v = (Get-Item $PSCommandPath).LastWriteTimeUtc.ToString("s") } catch {}
    Set-Content -Path $script:hbPath -Value ("pid={0} time={1} watch.ps1={2}" -f $PID, (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $v) -Encoding ASCII
  } catch {}
}

# ---- Self-update: when watch.ps1 itself is edited (e.g. by the linked chat), restart onto the new
# version automatically - but only if the new file parses cleanly, so a half-written edit can never
# kill the watcher. (Mutex is released first so the new instance can take over.)
$script:selfPath  = $PSCommandPath
$script:selfMtime = (Get-Item $script:selfPath).LastWriteTimeUtc
$script:selfBad   = [DateTime]::MinValue
function SelfUpdate {
  try {
    $m = (Get-Item $script:selfPath).LastWriteTimeUtc
    if ($m -eq $script:selfMtime -or $m -eq $script:selfBad) { return }
    $errs = $null; $tok = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($script:selfPath, [ref]$tok, [ref]$errs)
    if ($errs -and $errs.Count -gt 0) { $script:selfBad = $m; Log "self-update: new watch.ps1 has $($errs.Count) parse error(s) - staying on the running version"; return }
    Log "self-update: watch.ps1 changed -> restarting onto the new version"
    try { $script:__tlMutex.ReleaseMutex() } catch {}
    $notify.Visible = $false
    Start-Process -FilePath (Join-Path $env:WINDIR "System32\wscript.exe") -ArgumentList ('"' + (Join-Path $here "watch-hidden.vbs") + '"') -WorkingDirectory $here
    [System.Windows.Forms.Application]::Exit()
  } catch { Log "self-update check failed: $_" }
}

$script:FastTimer = New-Object System.Windows.Forms.Timer
$script:FastTimer.Interval = 5000
$script:FastTimer.add_Tick({ Heartbeat; if (-not $script:busy) { SelfUpdate } })
$script:FastTimer.Start()

Heartbeat
Log "==== watcher started (poll 10s, debounce $($script:DebounceSeconds)s, pid $PID) ===="
Balloon "Watcher running" "Auto-deploy watcher is in your system tray."
Check
[System.Windows.Forms.Application]::Run()
