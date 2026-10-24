$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$engine=(Get-Process -Id $PID).Path
$arguments="-NoProfile -WindowStyle Hidden -File `"$PSScriptRoot/Watch-Lab.ps1`""
$startup=[Environment]::GetFolderPath('Startup')
$shell=New-Object -ComObject WScript.Shell
$link=$shell.CreateShortcut((Join-Path $startup 'Minecraft AI Lab.lnk'))
$link.TargetPath=$engine
$link.Arguments=$arguments
$link.WorkingDirectory=$root
$link.WindowStyle=7
$link.Save()
try{
 $action=New-ScheduledTaskAction -Execute $engine -Argument $arguments -WorkingDirectory $root
 $user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
 $triggers=@((New-ScheduledTaskTrigger -AtLogOn -User $user),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)))
 $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
 $principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
 Register-ScheduledTask -TaskName 'Minecraft AI Lab Watchdog' -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force | Out-Null
 Write-Host 'Scheduled recovery installed.'
}catch{Write-Warning "Scheduled task unavailable; sign-in startup is installed. $($_.Exception.Message)"}
Remove-Item -LiteralPath "$root/data/lab-stopped" -ErrorAction SilentlyContinue
Start-Process -FilePath $engine -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden
Write-Host 'Automatic startup enabled and supervisor launched.'
