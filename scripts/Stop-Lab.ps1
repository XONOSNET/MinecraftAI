$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$h=@{'X-Lab-Token'=(Get-Content data/api-token -Raw).Trim()}
try{Invoke-RestMethod http://127.0.0.1:8000/control/shutdown -Method Post -Headers $h -ContentType application/json -Body '{}' -TimeoutSec 70|Out-Null}catch{Write-Warning $_}
foreach($file in @('data/bots.pid','data/service.pid')){
 if(Test-Path $file){$taskPid=[int](Get-Content $file);$proc=Get-CimInstance Win32_Process -Filter "ProcessId=$taskPid";if($proc -and $proc.CommandLine -match 'controller/index.js|uvicorn lab.service:app'){
  Get-CimInstance Win32_Process | Where-Object {$_.ParentProcessId -eq $taskPid}|ForEach-Object {Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue}
  Stop-Process -Id $taskPid -ErrorAction SilentlyContinue
 };Remove-Item -LiteralPath $file}
}
