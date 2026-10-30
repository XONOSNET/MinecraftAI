import ast
import threading
import time
from pathlib import Path
from types import SimpleNamespace


def test_backup_compression_never_holds_controller_lock_and_always_restores_saving(tmp_path,monkeypatch):
    source=Path(__file__).parents[1]/'lab/service.py'
    tree=ast.parse(source.read_text(encoding='utf-8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='backup')
    class Lock:
        held=False
        def __enter__(self):self.held=True
        def __exit__(self,*args):self.held=False
    lock=Lock();commands=[];events=[]
    monkeypatch.chdir(tmp_path);(tmp_path/'logs').mkdir();(tmp_path/'backups').mkdir();(tmp_path/'server/world').mkdir(parents=True)
    (tmp_path/'server/world/chunk').write_bytes(b'snapshot')
    log=tmp_path/'logs/minecraft-console.log';log.write_text('old log\n')
    def console(command):
        assert not lock.held;commands.append(command)
        if command=='save-all flush':
            with log.open('a') as stream:stream.write('Saved the game\n')
    def event(name,data):assert lock.held;events.append(name)
    import zipfile
    original=zipfile.ZipFile.write
    def write(self,*args,**kwargs):assert not lock.held;return original(self,*args,**kwargs)
    monkeypatch.setattr(zipfile.ZipFile,'write',write)
    env=dict(lock=lock,maintenance_lock=threading.Lock(),shutting_down=False,server_control=SimpleNamespace(snapshot=lambda:{'busy':False}),console=console,event=event,Path=Path,time=time)
    exec(compile(ast.Module(body=[fn],type_ignores=[]),'backup-route','exec'),env)
    env['backup']();assert commands==['save-off','save-all flush','save-on'];assert events==['backup']
    def fail(*args,**kwargs):raise OSError('disk full')
    monkeypatch.setattr(zipfile.ZipFile,'write',fail)
    try:env['backup']()
    except OSError:pass
    else:assert False
    assert commands[-1]=='save-on'
