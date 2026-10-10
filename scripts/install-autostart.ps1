# Run once: builds the frontend and registers a hidden logon task that keeps NEXUS running.
# Remove with: Unregister-ScheduledTask -TaskName NEXUS -Confirm:$false
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
npm run build
Pop-Location

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$root\scripts\start-nexus.ps1`""
# Two triggers: at logon, plus a 5-minute heartbeat that relaunches NEXUS if it ever died (IgnoreNew = no-op while it is running).
$trigger = @(
  (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME),
  (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650))
)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'NEXUS' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'NEXUS'
Write-Host 'NEXUS installed. Open http://interview.localhost'
