param([switch]$Once)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Set-Location $root
try{$lease=[IO.File]::Open("$root/data/watchdog.lock",'OpenOrCreate','ReadWrite','None')}catch{exit 0}
$PID | Set-Content data/watchdog.pid
function Log($message){Add-Content logs/watchdog.log "$(Get-Date -Format o) $message"}
$failures=0
$awakeLogged=$false
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class LabAwake { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags); }'
try{
 Log 'Supervisor started.'
 do{
  if(!(Test-Path data/lab-stopped)){
   # Keep the system awake while supervising; the display may still turn off.
   $awakeResult=[LabAwake]::SetThreadExecutionState([uint32]2147483649)
   if($awakeResult -and !$awakeLogged){Log 'System sleep inhibited while the lab runs; display sleep remains available.';$awakeLogged=$true}
   try{
    $state=$null
    try{$state=Invoke-RestMethod http://127.0.0.1:8000/status -TimeoutSec 8}catch{}
    if(!$state){
     $existing=$null
     if(Test-Path data/service.pid){$existing=Get-CimInstance Win32_Process -Filter "ProcessId=$([int](Get-Content data/service.pid))" -ErrorAction SilentlyContinue}
     if($existing -and $existing.CommandLine -match 'uvicorn lab.service:app'){throw 'Dashboard process is alive but unresponsive; preserving pending saves and retrying.'}
     $probe=[Net.Sockets.TcpClient]::new()
     try{
      if($probe.ConnectAsync('127.0.0.1',25565).Wait(1000) -and $probe.Connected){throw 'Minecraft is still running without its dashboard console. Use /stop in-game for a safe world save; automatic startup will then continue.'}
     }catch [AggregateException]{}finally{$probe.Dispose()}
     Log 'Dashboard absent; starting the lab.'
     & "$PSScriptRoot/Start-Lab.ps1"
    }else{
     & "$PSScriptRoot/Start-Bots.ps1" | Out-Null
     & "$PSScriptRoot/Start-DashboardLan.ps1"
     if(!$state.server.alive -and $state.server.desired_running -and !$state.server.busy){
      $headers=@{'X-Lab-Token'=(Get-Content data/api-token -Raw).Trim()}
      $null=Invoke-RestMethod http://127.0.0.1:8000/control/start-server -Method Post -Headers $headers -ContentType 'application/json' -Body '{"background":true,"automatic":true}' -TimeoutSec 15
      Log 'Requested Minecraft recovery.'
     }
    }
    $failures=0
   }catch{$failures=[Math]::Min(6,$failures+1);Log "Recovery waiting: $($_.Exception.Message)"}
  }else{$null=[LabAwake]::SetThreadExecutionState([uint32]2147483648);$awakeLogged=$false}
  if(!$Once){Start-Sleep -Seconds ([Math]::Min(300,15*[Math]::Pow(2,$failures)))}
 }while(!$Once)
}finally{$null=[LabAwake]::SetThreadExecutionState([uint32]2147483648);$lease.Dispose()}
