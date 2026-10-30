$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$receipt=Join-Path $PWD 'data/bedrock-firewall-result.json'
$taskPrincipal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
 $taskHostPath=(Get-Process -Id $PID).Path
 Start-Process -FilePath $taskHostPath -ArgumentList @('-NoProfile','-File',('"{0}"' -f $PSCommandPath)) -Verb RunAs -Wait
 exit
}
try {
 $identity=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
 if(!$identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Run this script as administrator to enable LAN Bedrock connections.'}
 # Existing Public-profile Java block rules override port-specific allow rules.
 # Exempt only the Bedrock listener ports, preserving blocks on all other ports.
 $javaPath=(Get-ChildItem -LiteralPath runtime/java -Filter java.exe -Recurse | Select-Object -First 1).FullName
 $blocked=Get-NetFirewallApplicationFilter | Where-Object {$_.Program -eq $javaPath} | Get-NetFirewallRule | Where-Object {$_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block'}
 foreach($rule in $blocked) {
  $port=$rule | Get-NetFirewallPortFilter
  if($port.LocalPort -eq 'Any') {
   $rule | Export-Clixml (Join-Path $PWD ('backups/bedrock-firewall-'+$rule.Name+'.xml'))
   if($port.Protocol -eq 'TCP') {$port | Set-NetFirewallPortFilter -LocalPort @('1-19131','19133-65535')}
   elseif($port.Protocol -eq 'UDP') {$port | Set-NetFirewallPortFilter -LocalPort @('1-19131','19134-65535')}
  }
 }
 foreach($entry in @(@{name='MinecraftAILab-Bedrock-TCP';protocol='TCP';ports=@(19132)},@{name='MinecraftAILab-Bedrock-UDP';protocol='UDP';ports=@(19132,19133)})) {
  $existing=Get-NetFirewallRule -Name $entry.name -ErrorAction SilentlyContinue
  if(!$existing) {
   New-NetFirewallRule -Name $entry.name -DisplayName ('Minecraft AI Lab Bedrock - '+$entry.protocol+' LAN only') -Direction Inbound -Action Allow -Enabled True -Profile Any -Protocol $entry.protocol -LocalPort $entry.ports -LocalAddress 192.168.1.24 -RemoteAddress 192.168.1.0/24 -InterfaceAlias 'Ethernet 2' -EdgeTraversalPolicy Block | Out-Null
  } else {
   Set-NetFirewallRule -Name $entry.name -Direction Inbound -Action Allow -Enabled True -Profile Any -InterfaceAlias 'Ethernet 2' -EdgeTraversalPolicy Block
   $existing | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol $entry.protocol -LocalPort $entry.ports
   $existing | Get-NetFirewallAddressFilter | Set-NetFirewallAddressFilter -LocalAddress 192.168.1.24 -RemoteAddress 192.168.1.0/24
  }
 }
 @{ok=$true;address='192.168.1.24';subnet='192.168.1.0/24';tcp=19132;udp=@(19132,19133)} | ConvertTo-Json | Set-Content -Encoding utf8 $receipt
} catch {
 @{ok=$false;error=$_.Exception.Message} | ConvertTo-Json | Set-Content -Encoding utf8 $receipt
 exit 1
}
