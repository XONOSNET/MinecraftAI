$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if(Test-Path data/bots.pid){$taskPid=[int](Get-Content data/bots.pid);$proc=Get-CimInstance Win32_Process -Filter "ProcessId=$taskPid";if($proc -and $proc.CommandLine -like '*controller/index.js*'){Write-Host 'Bots already running';return}}
$nodeCommand=Get-Command node -ErrorAction SilentlyContinue
$nodePath=if($nodeCommand){$nodeCommand.Source}elseif(Test-Path data/node-path){(Get-Content data/node-path -Raw).Trim()}else{throw 'Node.js not found. Run Enable-LabAutostart.ps1 from the lab terminal.'}
if(!(Test-Path -LiteralPath $nodePath)){throw "Node.js executable not found at $nodePath"}
$p=Start-Process -FilePath $nodePath -ArgumentList 'controller/index.js' -PassThru -WindowStyle Hidden -RedirectStandardOutput "$PWD/logs/bots.log" -RedirectStandardError "$PWD/logs/bots-error.log"
$p.Id|Set-Content data/bots.pid
