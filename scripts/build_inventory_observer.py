"""Build the optional 26.3 viewer against the installed Minecraft client."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '26.3'
LOADER = '0.20.1'
API = '0.166.0+26.3'
MAVEN = 'https://maven.fabricmc.net/net/fabricmc/'
INSTALLER = '1.1.2'


def install(java, mc, output, jar, api):
    installer = output / 'fabric-installer.jar'
    download(f'{MAVEN}fabric-installer/{INSTALLER}/fabric-installer-{INSTALLER}.jar', installer)
    subprocess.run([str(java), '-jar', str(installer), 'client', '-dir', str(mc),
                    '-mcversion', VERSION, '-loader', LOADER, '-noprofile'], check=True)
    game = mc / 'ai-lab-observer'
    mods, config = game / 'mods', game / 'config'
    mods.mkdir(parents=True, exist_ok=True)
    config.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(jar, mods / 'ai-lab-inventory-observer.jar')
    shutil.copyfile(api, mods / 'fabric-api.jar')
    (config / 'ai-lab-observer.json').write_text(json.dumps({'labDirectory': str(ROOT)}), encoding='utf-8')
    profiles = mc / 'launcher_profiles.json'
    data = json.loads(profiles.read_text(encoding='utf-8'))
    entries = data.setdefault('profiles', {})
    profile = entries.setdefault('ai-lab-inventory-observer-26.3', {})
    profile.update(name='AI Lab Observer (26.3)', type='custom',
                   lastVersionId=f'fabric-loader-{LOADER}-{VERSION}', gameDir=str(game))
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=mc,
                                     prefix='ai-lab-profile-', delete=False) as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
    Path(file.name).replace(profiles)
    print('Installed launcher profile: AI Lab Observer (26.3)')


def download(url, target):
    if not target.exists():
        temp = target.with_suffix('.download')
        with urllib.request.urlopen(url, timeout=60) as response:
            temp.write_bytes(response.read())
        temp.replace(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--java', required=True, type=Path, help='Java 25 executable with jdk.compiler')
    parser.add_argument('--minecraft', type=Path, default=Path(os.environ['APPDATA']) / '.minecraft')
    parser.add_argument('--install', action='store_true', help='Install the separate local profile while Minecraft and the launcher are closed')
    args = parser.parse_args()
    mc = args.minecraft.resolve()
    output = ROOT / 'runtime/inventory-observer-deps'
    output.mkdir(parents=True, exist_ok=True)
    source = ROOT / 'client/inventory-observer'
    client = mc / f'versions/{VERSION}/{VERSION}.jar'
    manifest = json.loads(client.with_suffix('.json').read_text(encoding='utf-8'))
    loader = output / 'fabric-loader.jar'
    api = output / 'fabric-api.jar'
    download(f'{MAVEN}fabric-loader/{LOADER}/fabric-loader-{LOADER}.jar', loader)
    download(f'{MAVEN}fabric-api/fabric-api/{API}/fabric-api-{API}.jar', api)
    modules = []
    with zipfile.ZipFile(api) as archive:
        for name in archive.namelist():
            if name.startswith('META-INF/jars/') and name.endswith('.jar'):
                dest = output / Path(name).name
                dest.write_bytes(archive.read(name))
                modules.append(dest)
    libraries = [mc / 'libraries' / lib['downloads']['artifact']['path']
                 for lib in manifest['libraries'] if 'artifact' in lib.get('downloads', {})]
    classpath = os.pathsep.join(str(p) for p in [client, loader, *modules, *libraries] if p.is_file())
    # A new classes directory keeps removed classes out of the artifact.
    with tempfile.TemporaryDirectory(prefix='inventory-observer-', dir=output) as folder:
        classes = Path(folder)
        argfile = classes / 'javac.args'
        arguments = ['-proc:none', '--release', '25', '-classpath', classpath, '-d', folder,
                     *(str(p) for p in (source / 'src').rglob('*.java'))]
        argfile.write_text('\n'.join('"' + arg.replace('\\', '/') + '"' for arg in arguments), encoding='utf-8')
        subprocess.run([str(args.java.resolve()), '-m', 'jdk.compiler/com.sun.tools.javac.Main',
                        '@' + str(argfile)], check=True)
        jar = output / 'ai-lab-inventory-observer.jar'
        with zipfile.ZipFile(jar, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for directory, files in [(classes, classes.rglob('*.class')),
                                     (source / 'resources', (source / 'resources').rglob('*'))]:
                for file in sorted(files):
                    if file.is_file():
                        archive.write(file, file.relative_to(directory).as_posix())
    print(jar)
    if args.install:
        install(args.java.resolve(), mc, output, jar, api)


if __name__ == '__main__':
    main()
