param([switch]$NoBots)
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if(Test-Path data/service.pid){$old=Get-Process -Id (Get-Content data/service.pid) -ErrorAction SilentlyContinue;if($old){throw 'Lab already running; inspect data/service.pid'}}
foreach($log in @('logs/service.log','logs/service-error.log','logs/bots.log','logs/bots-error.log','logs/minecraft-console.log')){if((Test-Path $log) -and (Get-Item $log).Length -gt 10000000){Move-Item -LiteralPath $log -Destination ($log+'.previous') -Force}}
$p=Start-Process -FilePath "$PWD/.venv/Scripts/python.exe" -ArgumentList '-m','uvicorn','lab.service:app','--host','127.0.0.1','--port','8000','--no-access-log' -PassThru -WindowStyle Hidden -RedirectStandardOutput "$PWD/logs/service.log" -RedirectStandardError "$PWD/logs/service-error.log"
$p.Id|Set-Content data/service.pid
$deadline=(Get-Date).AddMinutes(3)
do{
 Start-Sleep -Seconds 2
 try{$state=Invoke-RestMethod http://127.0.0.1:8000/status -TimeoutSec 2;$ready=$state.server_alive -and (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 25565 -State Listen -ErrorAction SilentlyContinue)}catch{$ready=$false}
 if((Get-Date) -gt $deadline){throw 'Startup timed out; inspect logs/service-error.log and logs/minecraft-console.log'}
}until($ready)
if(!(Test-Path data/arena.initialized)){
 $headers=@{'X-Lab-Token'=(Get-Content data/api-token -Raw).Trim()}
 Invoke-RestMethod http://127.0.0.1:8000/control/arena -Method Post -Headers $headers -ContentType application/json -Body '{}' -TimeoutSec 30|Out-Null
 'Research courses initialized; preserve this marker with the world.'|Set-Content data/arena.initialized
}
if(!$NoBots){& "$PSScriptRoot/Start-Bots.ps1"}
& "$PSScriptRoot/Start-DashboardLan.ps1"
Write-Host 'Lab ready. Dashboard http://127.0.0.1:8000. Minecraft Java 1.21.4: 127.0.0.1:25565.'
