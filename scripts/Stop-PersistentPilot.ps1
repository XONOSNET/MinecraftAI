$ErrorActionPreference='Stop'
$pilotStatus=Invoke-RestMethod 'http://127.0.0.1:8100/status' -TimeoutSec 3
if($pilotStatus.identity -ne 'HomeAI01' -or $pilotStatus.world_name -ne 'lab_persistent_pilot'){throw 'Unexpected pilot service.'}
Invoke-RestMethod 'http://127.0.0.1:8100/control/stop' -Method Post -TimeoutSec 30 | Out-Null
Write-Host 'Pilot paused. Its world, identity and unfinished work are preserved.'
