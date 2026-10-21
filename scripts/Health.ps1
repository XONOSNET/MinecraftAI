Set-Location (Split-Path $PSScriptRoot -Parent)
Invoke-RestMethod http://127.0.0.1:8000/status | ConvertTo-Json -Depth 6
Get-NetTCPConnection -LocalPort 25565,8000 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
