' The Tryline watcher - launch with NO visible window (system tray only).
' Uses WScript.Shell.Run with window style 0 (hidden) so there is never a console
' window to see or track - the watcher lives only in the system tray, the same way
' the Construction Passport / Folio / Beam watchers do. This is the launcher the
' Startup shortcut points at.
Option Explicit
Dim sh, here
Set sh = CreateObject("WScript.Shell")
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.CurrentDirectory = here
' 0 = hidden window, False = do not wait for it to exit.
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File """ & here & "watch.ps1""", 0, False
