$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if(Test-Path data/bots.pid){$taskPid=[int](Get-Content data/bots.pid);$proc=Get-CimInstance Win32_Process -Filter "ProcessId=$taskPid";if($proc -and $proc.CommandLine -like '*controller/index.js*'){Write-Host 'Bots already running';return}}
$p=Start-Process -FilePath (Get-Command node).Source -ArgumentList 'controller/index.js' -PassThru -WindowStyle Hidden -RedirectStandardOutput "$PWD/logs/bots.log" -RedirectStandardError "$PWD/logs/bots-error.log"
$p.Id|Set-Content data/bots.pid
