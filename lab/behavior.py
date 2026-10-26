"""Validated global rules and stable per-bot overrides, independent of weights."""
import copy
import hashlib
import json
import math
from pathlib import Path

SCHEMA=json.loads((Path(__file__).resolve().parent.parent/'config/behavior-schema.json').read_text(encoding='utf-8'))


class BehaviorRules:
    def __init__(self,path,names):
        self.path=Path(path);self.names=list(names)
        self.config=self.validate(json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {'version':1,'global':{},'bots':{}})

    def values(self,values,bot=False):
        if not isinstance(values,dict):raise ValueError('Rules must be an object')
        for key,value in values.items():
            field=SCHEMA.get(key)
            if field is None:raise ValueError('Unknown behavior rule: '+key)
            if bot and field.get('global_only'):raise ValueError(field['label']+' is a global safety rule')
            if type(value) not in (float,int) or not math.isfinite(value) or not field['min']<=value<=field['max']:
                raise ValueError(f"{field['label']} must be {field['min']}–{field['max']} {field['unit']}")
        return copy.deepcopy(values)

    def validate(self,config):
        if not isinstance(config,dict) or set(config)!={'version','global','bots'} or type(config['version']) is not int or config['version']!=1:
            raise ValueError('Unknown behavior configuration format')
        if not isinstance(config['bots'],dict) or any(name not in self.names for name in config['bots']):raise ValueError('Unknown bot in behavior overrides')
        return {'version':1,'global':self.values(config['global']),'bots':{name:self.values(v,True) for name,v in config['bots'].items()}}

    def frozen(self,config=None):
        config=self.validate(config if config is not None else self.config)
        encoded=json.dumps({'schema':SCHEMA,'config':config},sort_keys=True,separators=(',',':')).encode()
        return {'revision':hashlib.sha256(encoded).hexdigest()[:12],'config':config}

    def effective(self,name,frozen=None):
        frozen=frozen or self.frozen();config=frozen['config'];values={};sources={}
        for key,field in SCHEMA.items():
            global_value=config['global'].get(key,field['default']);override=config['bots'].get(name,{})
            value=override.get(key,global_value);source='bot override' if key in override else 'global' if key in config['global'] else 'default'
            if field.get('floor') and value<global_value:value=global_value;source='global minimum'
            values[key]=value;sources[key]=source
        return {'revision':frozen['revision'],'values':values,'sources':sources}

    def snapshot(self):
        frozen=self.frozen()
        return {**frozen,'schema':copy.deepcopy(SCHEMA),'effective':{name:self.effective(name,frozen) for name in self.names}}

    def update(self,data):
        if not isinstance(data,dict) or set(data)-{'scope','values','revision'}:raise ValueError('Choose a scope and behavior values')
        if data.get('revision')!=self.frozen()['revision']:raise ValueError('Behavior settings changed; reload before saving')
        scope=data.get('scope');config=copy.deepcopy(self.config)
        if scope=='global':config['global']=self.values(data.get('values'))
        elif scope in self.names:
            values=self.values(data.get('values'),True)
            if values:config['bots'][scope]=values
            else:config['bots'].pop(scope,None)
        else:raise ValueError('Choose global settings or a configured bot')
        config=self.validate(config);self.path.parent.mkdir(parents=True,exist_ok=True)
        tmp=self.path.with_suffix('.tmp');tmp.write_text(json.dumps(config,indent=2)+'\n',encoding='utf-8');tmp.replace(self.path)
        self.config=config
        return self.snapshot()
