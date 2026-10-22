# start-watcher: the ONE way to (re)start The Tryline tray watcher.
#   - stops every old copy (an old copy keeps the single-instance lock, which makes new launches exit silently)
#   - starts the watcher hidden, then WAITS for its heartbeat and tells you plainly if it is running
#   - if it is not, it re-runs the watcher capturing the error into logs\launcher-err.txt
#   - makes sure it also starts at every login
# Everything is written to logs\launcher.log so it can be read afterwards.
$here = $PSScriptRoot
Set-Location $here
$logDir = Join-Path $here "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$log = Join-Path $logDir "launcher.log"
"" | Set-Content $log
function L($m, $c = "Gray") { $line = "{0}  {1}" -f (Get-Date -Format "HH:mm:ss"), $m; Write-Host $line -ForegroundColor $c; Add-Content $log $line }
function Pause-Brief { if (-not $env:TL_NO_PAUSE) { Start-Sleep -Seconds 6 } }

L "The Tryline watcher launcher (PowerShell $($PSVersionTable.PSVersion))" "Cyan"
L "Folder: $here"

# 1. stop old copies
$old = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'watch\.ps1|watch-hidden\.vbs' })
if ($old.Count -eq 0) { L "No old watcher running." }
foreach ($p in $old) {
  L "Stopping old watcher process $($p.ProcessId) ($($p.Name))"
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { L "  could not stop it: $($_.Exception.Message)" "Yellow" }
}
Start-Sleep -Seconds 2

# 2. startup shortcut (so it survives reboots)
try {
  $vbs = Join-Path $here "watch-hidden.vbs"
  $wscript = Join-Path $env:WINDIR "System32\wscript.exe"
  $lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'TheTryline-Watcher.lnk'
  $sh = New-Object -ComObject WScript.Shell
  $s = $sh.CreateShortcut($lnk)
  $s.TargetPath = $wscript; $s.Arguments = '"' + $vbs + '"'; $s.WorkingDirectory = $here; $s.WindowStyle = 7
  if (Test-Path (Join-Path $here "watcher.ico")) { $s.IconLocation = (Join-Path $here "watcher.ico") }
  $s.Description = 'The Tryline auto-deploy watcher'; $s.Save()
  L "Startup shortcut OK: $lnk"
} catch { L "Could not create the startup shortcut: $($_.Exception.Message)" "Yellow" }

# 3. start hidden and wait for the heartbeat
$hb = Join-Path $logDir "heartbeat.txt"
Remove-Item $hb -ErrorAction SilentlyContinue
Start-Process -FilePath (Join-Path $env:WINDIR "System32\wscript.exe") -ArgumentList ('"' + (Join-Path $here "watch-hidden.vbs") + '"') -WorkingDirectory $here
L "Started. Waiting for the watcher to report in..."
$ok = $false
for ($i = 0; $i -lt 40 -and -not $ok; $i++) { Start-Sleep -Seconds 1; if (Test-Path $hb) { $ok = $true } }
if ($ok) { L ("WATCHER IS RUNNING  ->  " + (Get-Content $hb -Raw).Trim()) "Green"; L "Look for the tray icon (click the ^ arrow if hidden)."; Pause-Brief; exit 0 }

# 4. it did not come up: capture the real error
L "No heartbeat after 40 s. Re-running the watcher directly to capture the error..." "Yellow"
$errF = Join-Path $logDir "launcher-err.txt"; $outF = Join-Path $logDir "launcher-out.txt"
Remove-Item $errF, $outF -ErrorAction SilentlyContinue
$proc = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-STA","-File","`"$(Join-Path $here 'watch.ps1')`"" -WorkingDirectory $here -WindowStyle Hidden -PassThru -RedirectStandardError $errF -RedirectStandardOutput $outF
for ($i = 0; $i -lt 25 -and -not (Test-Path $hb); $i++) { Start-Sleep -Seconds 1 }
if (Test-Path $hb) { L ("WATCHER IS RUNNING (second attempt)  ->  " + (Get-Content $hb -Raw).Trim()) "Green"; Pause-Brief; exit 0 }
L "STILL not running. Details:" "Red"
if ($proc.HasExited) { L "  watch.ps1 exited with code $($proc.ExitCode)" "Red" }
foreach ($f in @($errF, $outF)) { if ((Test-Path $f) -and (Get-Item $f).Length -gt 0) { L "  --- $(Split-Path $f -Leaf) ---"; Get-Content $f -Tail 15 | ForEach-Object { L "  $_" } } }
L "  --- last lines of logs\watcher.log ---"
if (Test-Path (Join-Path $logDir "watcher.log")) { Get-Content (Join-Path $logDir "watcher.log") -Tail 6 | ForEach-Object { L "  $_" } }
L "Send logs\launcher.log to Claude (it can read it from the project folder)." "Yellow"
if (-not $env:TL_NO_PAUSE) { Read-Host "Press Enter to close" }
exit 1
