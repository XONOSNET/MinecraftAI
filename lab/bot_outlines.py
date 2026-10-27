"""Vanilla bot-only outlines, restored on the next server tick after resets."""
import json
from pathlib import Path
from .config import AGENT_COUNT


def install_outline_pack(path,count=AGENT_COUNT):
    if type(count) is not int or not 1<=count<=10:raise ValueError('Choose 1-10 configured bots.')
    commands=[f'execute as @a[name=LabAI{i}] unless data entity @s active_effects[{{id:"minecraft:glowing"}}] run effect give @s minecraft:glowing infinite 0 true' for i in range(count)]
    files={
        'pack.mcmeta':json.dumps({'pack':{'pack_format':61,'description':'AI Laboratory persistent bot outlines'}}),
        'data/minecraft/tags/function/tick.json':json.dumps({'values':['lab_outlines:tick']}),
        'data/lab_outlines/function/tick.mcfunction':'\n'.join(commands)+'\n',
    }
    root=Path(path)
    for relative,content in files.items():
        target=root/relative;target.parent.mkdir(parents=True,exist_ok=True)
        if not target.exists() or target.read_text(encoding='utf-8')!=content:target.write_text(content,encoding='utf-8')
