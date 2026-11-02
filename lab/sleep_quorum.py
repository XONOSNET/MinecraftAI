"""Exclude inactive attempts from vanilla sleeping's required head count."""
import json
from pathlib import Path


def install_pack(path):
    files={
        'pack.mcmeta':json.dumps({'pack':{'pack_format':61,'description':'AI Laboratory active-trial sleep quorum'}}),
        'data/minecraft/tags/function/load.json':json.dumps({'values':['lab_sleep:load']}),
        'data/lab_sleep/function/load.mcfunction':'scoreboard objectives add lab_sleep dummy\nexecute if score #saved lab_sleep matches 1 run function lab_sleep:restore\n',
        'data/lab_sleep/function/apply.mcfunction':'$gamerule playersSleepingPercentage $(percentage)\n',
        'data/lab_sleep/function/restore.mcfunction':
            'execute store result storage lab:sleep percentage int 1 run scoreboard players get #original lab_sleep\n'
            'function lab_sleep:apply with storage lab:sleep\nscoreboard players set #saved lab_sleep 0\n',
        'data/lab_sleep/function/update.mcfunction':
            'execute unless score #saved lab_sleep matches 1 store result score #original lab_sleep run gamerule playersSleepingPercentage\n'
            'scoreboard players set #saved lab_sleep 1\n'
            'execute store result score #eligible lab_sleep run execute if entity @a[gamemode=!spectator]\n'
            'scoreboard players operation #percentage lab_sleep = #required lab_sleep\n'
            'scoreboard players set #hundred lab_sleep 100\n'
            'scoreboard players operation #percentage lab_sleep *= #hundred lab_sleep\n'
            'execute if score #eligible lab_sleep matches 1.. run scoreboard players operation #percentage lab_sleep /= #eligible lab_sleep\n'
            'execute if score #percentage lab_sleep matches 101.. run scoreboard players set #percentage lab_sleep 100\n'
            'execute store result storage lab:sleep percentage int 1 run scoreboard players get #percentage lab_sleep\n'
            'function lab_sleep:apply with storage lab:sleep\n',
    }
    for name,text in files.items():
        target=Path(path)/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text,encoding='utf-8')


class SleepQuorum:
    def __init__(self,command,pack_path=None):
        self.command=command;self.active=False;self.required=None;self.next_at=0
        if pack_path:install_pack(pack_path)

    def tick(self,session,now):
        running=session and session.get('active') and session.get('phase')=='running' and session.get('first_night')
        required=sum(session.get('results',{}).get(name,{}).get('state') not in ('complete','stopped') for name in session.get('bots',[])) if running else 0
        if not required:self.restore();return
        if required==self.required and now<self.next_at:return
        self.command(f'scoreboard players set #required lab_sleep {required}')
        self.command('function lab_sleep:update')
        self.active=True;self.required=required;self.next_at=now+10

    def restore(self):
        if self.active:self.command('function lab_sleep:restore')
        self.active=False;self.required=None;self.next_at=0
