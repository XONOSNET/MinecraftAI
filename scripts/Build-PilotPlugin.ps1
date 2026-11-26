param([string]$JavaHome, [string]$OutputDirectory='logs/pilot-plugin-build')
$ErrorActionPreference='Stop'
$pilotRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $pilotRoot
$pilotJavac=$null
if($JavaHome){
    $pilotCandidate=Join-Path $JavaHome 'bin/javac.exe'
    if(Test-Path -LiteralPath $pilotCandidate){$pilotJavac=$pilotCandidate}
    elseif(Test-Path -LiteralPath (Join-Path $JavaHome 'javac.exe')){$pilotJavac=Join-Path $JavaHome 'javac.exe'}
    else {throw 'The supplied JavaHome has no Java compiler.'}
}else{
    $pilotCommand=Get-Command javac -ErrorAction SilentlyContinue
    if($pilotCommand){$pilotJavac=$pilotCommand.Source}
    if(!$pilotJavac){
        $pilotMinecraftRuntime=Join-Path $env:LOCALAPPDATA 'Packages/Microsoft.4297127D64EC6_8wekyb3d8bbwe/LocalCache/Local/runtime'
        if(Test-Path -LiteralPath $pilotMinecraftRuntime){$pilotJavac=Get-ChildItem -LiteralPath $pilotMinecraftRuntime -Filter javac.exe -File -Recurse | Select-Object -First 1 -ExpandProperty FullName}
    }
}
if(!$pilotJavac){throw 'No existing JDK compiler was found. Supply -JavaHome; nothing was downloaded.'}
$pilotJarTool=Join-Path (Split-Path $pilotJavac -Parent) 'jar.exe'
if(!(Test-Path -LiteralPath $pilotJarTool)){throw 'The selected JDK has no jar tool.'}
$pilotOutput=[IO.Path]::GetFullPath((Join-Path $pilotRoot $OutputDirectory))
$pilotLogs=[IO.Path]::GetFullPath((Join-Path $pilotRoot 'logs'))
if(!$pilotOutput.StartsWith($pilotLogs+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){
    throw 'Plugin binaries must stay inside the ignored logs directory.'
}
$pilotSource=Join-Path $pilotRoot 'pilot/plugin'
$pilotApi=Join-Path $pilotRoot 'server/libraries/io/papermc/paper/paper-api/1.21.4-R0.1-SNAPSHOT/paper-api-1.21.4-R0.1-SNAPSHOT.jar'
if(!(Test-Path -LiteralPath $pilotApi)){throw 'The project-local Paper 1.21.4 API cache is missing.'}
New-Item -ItemType Directory -Path $pilotOutput -Force | Out-Null
$pilotClasses=Join-Path $pilotOutput ('classes-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $pilotClasses | Out-Null
$pilotClasspath=(Get-ChildItem -LiteralPath (Join-Path $pilotRoot 'server/libraries') -Filter *.jar -File -Recurse | Sort-Object FullName | Select-Object -ExpandProperty FullName) -join ';'
$pilotArguments=@('-proc:none','--release','21','-classpath',$pilotClasspath,'-d',$pilotClasses)
$pilotArguments+=Get-ChildItem -LiteralPath (Join-Path $pilotSource 'src') -Filter *.java -File -Recurse | Sort-Object FullName | Select-Object -ExpandProperty FullName
$pilotArgFile=Join-Path $pilotOutput 'javac.args'
$pilotQuoted=@($pilotArguments | ForEach-Object {'"'+$_.Replace('\','/')+'"'})
[IO.File]::WriteAllLines($pilotArgFile,$pilotQuoted,[Text.UTF8Encoding]::new($false))
& $pilotJavac ('@'+$pilotArgFile)
if($LASTEXITCODE -ne 0){throw 'Pilot plugin compilation failed.'}
$pilotMain=Join-Path $pilotClasses 'dev/xonosnet/pilot/PilotWorlds.class'
$pilotClassBytes=[IO.File]::ReadAllBytes($pilotMain)
if(($pilotClassBytes[6]*256+$pilotClassBytes[7]) -ne 65){throw 'Expected Java 21 class files.'}
$pilotJar=Join-Path $pilotOutput 'PersistentPilotWorlds.jar'
& $pilotJarTool --create --file $pilotJar -C $pilotClasses . -C $pilotSource plugin.yml
if($LASTEXITCODE -ne 0){throw 'Pilot plugin JAR creation failed.'}
[pscustomobject]@{artifact=$pilotJar;sha256=(Get-FileHash -LiteralPath $pilotJar -Algorithm SHA256).Hash.ToLowerInvariant();compiler=$pilotJavac;java_release=21}
