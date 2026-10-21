param([switch]$AcceptEula)
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
foreach($dir in @('runtime','server','data','logs','checkpoints','backups')){New-Item -ItemType Directory -Force $dir|Out-Null}
if(!(Test-Path runtime/java)){
 $asset=(Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows')[0].binary.package
 Invoke-WebRequest $asset.link -OutFile runtime/java.zip
 if((Get-FileHash runtime/java.zip -Algorithm SHA256).Hash.ToLower() -ne $asset.checksum){throw 'Java checksum mismatch'}
 Expand-Archive runtime/java.zip runtime/java
 $asset|ConvertTo-Json|Set-Content data/java-download.json
}
if(!(Test-Path server/paper.jar)){
 $build=(Invoke-RestMethod 'https://fill.papermc.io/v3/projects/paper/versions/1.21.4/builds' -Headers @{'User-Agent'='MinecraftAILab/0.1 (local research)'})[0]
 $asset=$build.downloads.'server:default';Invoke-WebRequest $asset.url -OutFile server/paper.jar
 if((Get-FileHash server/paper.jar -Algorithm SHA256).Hash.ToLower() -ne $asset.checksums.sha256){throw 'Paper checksum mismatch'}
 $build|ConvertTo-Json -Depth 8|Set-Content data/paper-build.json
}
if(!(Test-Path .venv)){python -m venv .venv}
./.venv/Scripts/python -m pip install -r requirements-lock.txt --extra-index-url https://download.pytorch.org/whl/cpu
if(!(Test-Path runtime/package/bin/npm-cli.js)){
 $npm=Invoke-RestMethod https://registry.npmjs.org/npm/12.2.0
 Invoke-WebRequest $npm.dist.tarball -OutFile runtime/npm.tgz
 tar -xf runtime/npm.tgz -C runtime
}
node runtime/package/bin/npm-cli.js ci
if(!(Test-Path server/server.properties)){Copy-Item config/server.properties server/server.properties}
if($AcceptEula){
 if(Test-Path server/eula.txt){Copy-Item server/eula.txt ('backups/eula-'+(Get-Date -Format yyyyMMddHHmmss)+'.txt')}
 'eula=true'|Set-Content server/eula.txt
}elseif(!(Test-Path server/eula.txt)){throw 'Read https://www.minecraft.net/eula and rerun with -AcceptEula only if you agree.'}
