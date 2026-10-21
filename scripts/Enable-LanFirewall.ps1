param(
 [string]$LocalAddress='192.168.1.24',
 [string]$Subnet='192.168.1.0/24',
 [string]$InterfaceAlias='Ethernet 2'
)
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$receipt=Join-Path $PWD 'data/lan-firewall-result.json'
try {
 $identity=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
 if(!$identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Run this script as administrator to add the LAN-only firewall rule.'}
 $ruleName='MinecraftAILab-LAN-25565'
 $existing=Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
 if($existing){
  $existing|Export-Clixml (Join-Path $PWD ('backups/lan-firewall-'+(Get-Date -Format yyyyMMddHHmmss)+'.xml'))
  Set-NetFirewallRule -Name $ruleName -Direction Inbound -Action Allow -Enabled True -Profile Any -InterfaceAlias $InterfaceAlias -EdgeTraversalPolicy Block
  $existing|Get-NetFirewallPortFilter|Set-NetFirewallPortFilter -Protocol TCP -LocalPort 25565
  $existing|Get-NetFirewallAddressFilter|Set-NetFirewallAddressFilter -LocalAddress $LocalAddress -RemoteAddress $Subnet
 }else{
  New-NetFirewallRule -Name $ruleName -DisplayName 'Minecraft AI Laboratory - LAN only' -Direction Inbound -Action Allow -Enabled True -Profile Any -Protocol TCP -LocalPort 25565 -LocalAddress $LocalAddress -RemoteAddress $Subnet -InterfaceAlias $InterfaceAlias -EdgeTraversalPolicy Block|Out-Null
 }
 $rule=Get-NetFirewallRule -Name $ruleName
 $address=$rule|Get-NetFirewallAddressFilter
 $port=$rule|Get-NetFirewallPortFilter
 @{ok=$true;name=$ruleName;localAddress=$address.LocalAddress;remoteAddress=$address.RemoteAddress;localPort=$port.LocalPort;enabled=[string]$rule.Enabled;time=(Get-Date -Format o)}|ConvertTo-Json -Depth 4|Set-Content -Encoding utf8 $receipt
}catch{
 @{ok=$false;error=$_.Exception.Message;time=(Get-Date -Format o)}|ConvertTo-Json|Set-Content -Encoding utf8 $receipt
 exit 1
}
