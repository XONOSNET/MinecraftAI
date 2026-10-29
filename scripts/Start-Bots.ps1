$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
# The watchdog and a manual restart can reach this script simultaneously.
# Hold an exclusive workspace lock through both the PID check and PID write.
$taskLaunchLock=$null
try {
    for($taskLaunchAttempt=0;$taskLaunchAttempt -lt 100;$taskLaunchAttempt++){
        try {$taskLaunchLock=[System.IO.File]::Open("$PWD/data/bots-launch.lock",[System.IO.FileMode]::OpenOrCreate,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None);break}
        catch [System.IO.IOException] {Start-Sleep -Milliseconds 100}
    }
    if(!$taskLaunchLock){throw 'Timed out waiting for the bot launcher lock.'}
    if(Test-Path data/bots.pid){$taskPid=[int](Get-Content data/bots.pid);$proc=Get-CimInstance Win32_Process -Filter "ProcessId=$taskPid";if($proc -and $proc.CommandLine -like '*controller/index.js*'){Write-Host 'Bots already running';return}}
    $nodeCommand=Get-Command node -ErrorAction SilentlyContinue
    $nodePath=if($nodeCommand){$nodeCommand.Source}elseif(Test-Path data/node-path){(Get-Content data/node-path -Raw).Trim()}else{throw 'Node.js not found. Run Enable-LabAutostart.ps1 from the lab terminal.'}
    if(!(Test-Path -LiteralPath $nodePath)){throw "Node.js executable not found at $nodePath"}
    $p=Start-Process -FilePath $nodePath -ArgumentList 'controller/index.js' -PassThru -WindowStyle Hidden -RedirectStandardOutput "$PWD/logs/bots.log" -RedirectStandardError "$PWD/logs/bots-error.log"
    $p.Id|Set-Content data/bots.pid
} finally {
    if($taskLaunchLock){$taskLaunchLock.Dispose()}
}
