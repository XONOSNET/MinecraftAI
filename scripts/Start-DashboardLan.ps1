$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$config=Get-Content config/lan.json -Raw|ConvertFrom-Json
if(!$config.dashboard_https){return}
if(Test-Path data/dashboard-lan.pid){$taskPid=[int](Get-Content data/dashboard-lan.pid);$existing=Get-CimInstance Win32_Process -Filter "ProcessId=$taskPid";if($existing -and $existing.CommandLine -match 'lab.dashboard_lan'){return}}
$p=Start-Process -FilePath "$PWD/.venv/Scripts/python.exe" -ArgumentList '-m','lab.dashboard_lan' -WindowStyle Hidden -PassThru -RedirectStandardOutput "$PWD/logs/dashboard-lan.log" -RedirectStandardError "$PWD/logs/dashboard-lan-error.log"
$p.Id|Set-Content data/dashboard-lan.pid
