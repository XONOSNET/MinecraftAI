$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
# Controller-only reload: preserve Minecraft and the dashboard processes.
if(Test-Path -LiteralPath data/bots.pid){
    $taskBotPid=[int](Get-Content -LiteralPath data/bots.pid)
    $taskBotProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$taskBotPid"
    if($taskBotProcess){
        if($taskBotProcess.Name -ne 'node.exe' -or $taskBotProcess.CommandLine -notmatch 'controller[/\\]index\.js'){
            throw 'Saved PID does not identify the lab bot controller; nothing was stopped.'
        }
        Stop-Process -Id $taskBotPid -Force
        Wait-Process -Id $taskBotPid -Timeout 15 -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath data/bots.pid
}
& "$PSScriptRoot/Start-Bots.ps1"
