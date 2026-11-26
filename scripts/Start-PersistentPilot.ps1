param([switch]$Enable)
$ErrorActionPreference='Stop'
$pilotProject=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $pilotProject
$pilotAddress='http://127.0.0.1:8100'
try {
    $pilotStatus=Invoke-RestMethod "$pilotAddress/status" -TimeoutSec 2
}catch {$pilotStatus=$null}
if($pilotStatus){
    if($pilotStatus.identity -ne 'HomeAI01' -or $pilotStatus.world_name -ne 'lab_persistent_pilot'){throw 'Unexpected service on the pilot port.'}
    if($Enable){Invoke-RestMethod "$pilotAddress/control/start" -Method Post -TimeoutSec 5 | Out-Null}
    Write-Host "Pilot controls: $pilotAddress"
    return
}
if(!(Test-Path -LiteralPath 'server/plugins/PersistentPilotWorlds.jar')){throw 'The persistent-world plugin must be installed at a safe lab restart before starting the pilot.'}
New-Item -ItemType Directory -Path 'logs/persistent-pilot','data/persistent-pilot' -Force | Out-Null
$pilotNode=(Get-Command node -ErrorAction Stop).Source
$pilotArguments=@('pilot/index.cjs')
if($Enable){$pilotArguments+='--enable'}
$pilotProcess=Start-Process -FilePath $pilotNode -ArgumentList $pilotArguments -WorkingDirectory $pilotProject -PassThru -WindowStyle Hidden -RedirectStandardOutput "$pilotProject/logs/persistent-pilot/service.log" -RedirectStandardError "$pilotProject/logs/persistent-pilot/service-error.log"
$pilotProcess.Id | Set-Content -LiteralPath 'data/persistent-pilot/service.pid'
$pilotDeadline=(Get-Date).AddSeconds(15)
do {
    Start-Sleep -Milliseconds 500
    if($pilotProcess.HasExited){throw 'Pilot service stopped; inspect logs/persistent-pilot/service-error.log.'}
    try {$pilotStatus=Invoke-RestMethod "$pilotAddress/status" -TimeoutSec 1; break}catch{}
}while((Get-Date) -lt $pilotDeadline)
if(!$pilotStatus){throw 'Pilot controls did not become ready.'}
Write-Host "Pilot controls: $pilotAddress"
if(!$pilotStatus.enabled){Write-Host 'Pilot is stopped. Click Start / resume or run this script with -Enable.'}
