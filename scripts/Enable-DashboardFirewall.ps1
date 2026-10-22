$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
try{
 if(Get-NetFirewallRule -Name 'MinecraftAILab-Dashboard-8000' -ErrorAction SilentlyContinue){Remove-NetFirewallRule -Name 'MinecraftAILab-Dashboard-8000' -ErrorAction Stop}
 New-NetFirewallRule -Name 'MinecraftAILab-Dashboard-8000' -DisplayName 'Minecraft AI Lab HTTPS dashboard - LAN only' -Direction Inbound -Action Allow -Enabled True -Profile Any -Protocol TCP -LocalPort 8000 -LocalAddress 192.168.1.24 -RemoteAddress 192.168.1.0/24 -InterfaceAlias 'Ethernet 2' -EdgeTraversalPolicy Block -ErrorAction Stop | Out-Null
 @{ok=$true}|ConvertTo-Json|Set-Content data/dashboard-firewall-result.json
}catch{@{ok=$false;error=$_.Exception.Message}|ConvertTo-Json|Set-Content data/dashboard-firewall-result.json;exit 1}

