@echo off
set "taskBedrockShell=C:\Users\timot\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe"
"%taskBedrockShell%" -NoProfile -Command "Start-Process -FilePath '%taskBedrockShell%' -ArgumentList '-NoProfile -File ""%~dp0Enable-BedrockFirewall.ps1""' -Verb RunAs -Wait"
echo Bedrock firewall setup finished. Details: F:\Projects\AIMINECRAFTPLAYER\data\bedrock-firewall-result.json
pause
