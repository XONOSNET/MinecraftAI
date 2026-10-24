$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
'Automatic startup disabled' | Set-Content "$root/data/lab-stopped"
Unregister-ScheduledTask -TaskName 'Minecraft AI Lab Watchdog' -Confirm:$false -ErrorAction SilentlyContinue
$link=Join-Path ([Environment]::GetFolderPath('Startup')) 'Minecraft AI Lab.lnk'
Remove-Item -LiteralPath $link -ErrorAction SilentlyContinue
if(Test-Path "$root/data/watchdog.pid"){
 $taskPid=[int](Get-Content "$root/data/watchdog.pid")
 $process=Get-CimInstance Win32_Process -Filter "ProcessId=$taskPid" -ErrorAction SilentlyContinue
 if($process -and $process.CommandLine -like "*$root*Watch-Lab.ps1*"){Stop-Process -Id $taskPid -ErrorAction SilentlyContinue}
}
Write-Host 'Automatic startup disabled. Running lab services were left online.'
