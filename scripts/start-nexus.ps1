# Starts NEXUS (API + built frontend) on http://interview.localhost (port 80).
# Registered as a logon task by scripts\install-autostart.ps1. Logs: logs\server.log
$root = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force "$root\logs" | Out-Null
$env:PORT = '80'
Set-Location "$root\server"
# Restart loop: if the server crashes (e.g. Mongo not up yet at login), retry after 10s.
while ($true) {
  node --import tsx src/index.ts *>> "$root\logs\server.log"
  Start-Sleep -Seconds 10
}
