@echo off
set "taskBedrockShell=C:\Users\timot\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe"
"%taskBedrockShell%" -NoProfile -File "%~dp0Enable-BedrockFirewall.ps1"
echo Firewall result: F:\Projects\AIMINECRAFTPLAYER\data\bedrock-firewall-result.json
pause
