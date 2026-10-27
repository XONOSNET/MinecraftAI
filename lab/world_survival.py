"""Bounded physical lesson resources and native bed home markers."""
import copy
import json
import math

ADVANCED=('iron_age','homestead','home_defense')
BASE=['Enclose a hut','Craft and place a chest','Craft a wooden pickaxe','Craft a wooden axe','Craft a wooden shovel','Store eight planks and equip the axe','Mine stone with the wooden pickaxe','Craft a stone pickaxe','Craft a stone axe','Craft and place a furnace','Smelt a log into charcoal','Mount indoor and outdoor wall torches']
IRON=['Descend a reversible mine staircase','Mine coal for furnace fuel','Mine iron with a stone pickaxe','Climb back to the surface and return home','Smelt raw iron','Craft an iron pickaxe','Craft shears','Craft an iron sword']
HOME=['Shear sheep and collect three wool','Craft and place a bed; register home','Obtain food from livestock','Cook food in the furnace','Craft and equip a full iron armor set','Store cooked food and spare iron']
MISSION_LESSONS={'iron_age':BASE+IRON,'homestead':BASE+IRON+HOME,'home_defense':BASE+IRON+HOME+['Retreat from a controlled monster and close the home door','Defend home with armor and a sword','Return safely to the bed home']}

class SurvivalLessons:
    def cleanup_survival(self):
        self.command('kill @e[tag=lab_world_survival]')
        self.command('kill @e[tag=lab_world_home]')
        self.saved['homes']={}

    def survival(self,data,display_name):
        s=self.session;name=data.get('agent')
        if not s or not s['active'] or s['phase']!='running' or s['mission'] not in (*ADVANCED,'first_night') or name not in s['bots'] or data.get('run')!=s['run']:raise ValueError('No matching active survival lesson.')
        action=data.get('action')
        if s['mission']=='first_night' and action not in ('home','cleanup'):raise ValueError('First Night cannot create advanced resource stations or threats.')
        plot=s['camp']['plots'][s['bots'].index(name)] if s.get('camp') else s['results'].get(name,{}).get('plot')
        if not plot:raise ValueError('No surveyed home plot.')
        tag='lab_world_'+name
        if action=='station':
            stations=s.setdefault('survival_stations',{})
            if name in stations:return copy.deepcopy(stations[name])
            index=s['bots'].index(name);direction=-1 if index<4 else 1
            x=math.floor(s['camp']['spawn'][0])+(index%4)*12-18;y=plot['y'];z=plot['z']+direction*29
            x0,x1,z0,z1=s['bounds']
            if y<8 or not x0+6<x<x1-6 or not z0+19<z<z1-19:raise ValueError('Insufficient safe mine margin.')
            # Two-block treads leave a full landing between one-block rises.
            stairs=[]
            for step in range(6):
                yy=y-step
                for tread in range(2):
                    zz=z+direction*(step*2+tread);stairs.append([x+.5,yy+.1,zz+.5])
                    self.command(f'fill {x-1} {yy-1} {zz} {x+1} {yy-1} {zz} minecraft:stone')
                    self.command(f'fill {x-1} {yy} {zz} {x+1} {y+3} {zz} minecraft:air')
                    for wall in (x-2,x+2):self.command(f'fill {wall} {yy} {zz} {wall} {y+1} {zz} minecraft:stone')
            bottom=y-5;face=z+direction*13
            self.command(f'fill {x-6} {bottom-1} {face-5} {x+5} {bottom-1} {face+5} minecraft:stone')
            self.command(f'fill {x-4} {bottom} {face-3} {x+4} {y+3} {face+3} minecraft:air')
            self.command(f'fill {x-5} {bottom} {face-5} {x-2} {y+3} {face+5} minecraft:air')
            # Contain bouncing drops; leave the central staircase entrance open.
            for side in (x-6,x+5):self.command(f'fill {side} {bottom} {face-5} {side} {bottom+1} {face+5} minecraft:stone')
            back=face+direction*5;front=face-direction*5
            self.command(f'fill {x-6} {bottom} {back} {x+5} {bottom+1} {back} minecraft:stone')
            for left,right in ((x-6,x-2),(x+2,x+5)):self.command(f'fill {left} {bottom} {front} {right} {bottom+1} {front} minecraft:stone')
            ores=[];coal=[]
            for dx in range(-4,4):
                for dy in range(5):
                    q=[x+dx,bottom+dy,face];ores.append(q);self.command(f'setblock {q[0]} {q[1]} {q[2]} minecraft:iron_ore')
            for dz in range(1,5):
                for dy in range(2):
                    q=[x-4,bottom+dy,face-direction*dz];coal.append(q);self.command(f'setblock {q[0]} {q[1]} {q[2]} minecraft:coal_ore')
            # The surface apron also links to the quarry's existing corridor.
            for zz in range(min(z,z-direction*7),max(z,z-direction*7)+1):
                self.command(f'fill {x-1} {y-1} {zz} {x+1} {y-1} {zz} minecraft:grass_block')
                self.command(f'fill {x-1} {y} {zz} {x+1} {y+2} {zz} minecraft:air')
            animals=[x+3.5,y,z-direction*2+.5]
            self.command(f'fill {x+1} {y-1} {z-4} {x+5} {y-1} {z+4} minecraft:grass_block')
            self.command(f'fill {x+1} {y} {z-4} {x+5} {y+3} {z+4} minecraft:air')
            self.command(f'fill {x+5} {y} {z-4} {x+5} {y} {z+4} minecraft:oak_fence')
            for end in (z-4,z+4):self.command(f'fill {x+1} {y} {end} {x+5} {y} {end} minecraft:oak_fence')
            for dz in range(-3,4):
                if dz not in (-direction,-2*direction,-3*direction):self.command(f'setblock {x+1} {y} {z+dz} minecraft:oak_fence')
            for i,mob in enumerate(['sheep']*3+['cow']*2):
                extra=',Color:0b,Sheared:0b' if mob=='sheep' else ''
                self.command(f'summon minecraft:{mob} {x+3.5} {y} {z-2+i+.5} '+f'{{Tags:["lab_world_survival","{tag}"],CustomName:'+json.dumps(json.dumps({'text':name+' lesson '+mob}))+',NoAI:1b,PersistenceRequired:1b'+extra+'}')
            # A separate wood apron keeps logs out of the animal fence and
            # catches drops on both sides, including on uneven natural ground.
            wood_z=z-direction*3;near=z-direction;far=z-direction*6
            self.command(f'fill {x-7} {y-1} {min(near,far)} {x+1} {y-1} {max(near,far)} minecraft:grass_block')
            self.command(f'fill {x-7} {y} {min(near,far)} {x+1} {y+3} {max(near,far)} minecraft:air')
            logs=[[x-4,y+dy,wood_z] for dy in range(4)]
            self.command(f'fill {x-4} {y} {wood_z} {x-4} {y+3} {wood_z} minecraft:oak_log')
            stations[name]=dict(stairs=stairs,entrance=stairs[0],bottom=[x+.5,bottom+.1,face-direction*1.5],ores=ores,coal=coal,logs=logs,animals=animals,animal_label=name+' lesson ',iron_target=8 if s['mission']=='iron_age' else 32)
            return copy.deepcopy(stations[name])
        if action=='home':
            p=data.get('position')
            if not isinstance(p,list) or len(p)!=3 or any(type(v) is not int for v in p):raise ValueError('Invalid bed position.')
            x,y,z=p
            if y!=plot['y'] or not plot['x']-2<=x<=plot['x']+2 or not plot['z']-2<=z<=plot['z']+2:raise ValueError('The bed must be inside this bot’s hut.')
            self.command(f'kill @e[tag=lab_home_{name}]')
            condition=f'execute if block {x} {y} {z} minecraft:white_bed'
            self.command(f'{condition} run spawnpoint {name} {x} {y} {z}')
            for entity,height,payload in [('item_display',4.25,'item:{id:"minecraft:white_bed",count:1},transformation:{scale:[0.45f,0.45f,0.45f]},billboard:"center"'),('text_display',4.9,'text:'+json.dumps(json.dumps({'text':display_name+' · HOME','color':'aqua'}))+',billboard:"center",background:0,shadow:1b,transformation:{scale:[0.55f,0.55f,0.55f]}')]:
                self.command(f'{condition} run summon minecraft:{entity} {x+.5} {y+height} {z+.5} '+f'{{Tags:["lab_world_home","lab_home_{name}"],brightness:{{block:15,sky:15}},'+payload+'}')
            home=dict(position=p,owner=display_name,run=s['run']);self.saved.setdefault('homes',{})[name]=home;self.save();return home
        if action=='threat':
            if s['mission']!='home_defense' or name not in self.saved.get('homes',{}):raise ValueError('Build and register a bed home before defense practice.')
            threats=s.setdefault('survival_threats',{})
            if name not in threats:
                # The second row's north approach faces the first row's huts.
                # Spawn in the open aisle, offset from the retreating bot.
                second_row=s['bots'].index(name)>=4
                label='WorldThreat'+name;x=plot['x']+(3 if second_row else 0);y=plot['y'];z=plot['z']-(5 if second_row else 9)
                self.command(f'summon minecraft:husk {x+.5} {y} {z+.5} '+f'{{Tags:["lab_combat","lab_world_survival","{tag}"],CustomName:'+json.dumps(json.dumps({'text':label}))+',PersistenceRequired:1b,CanPickUpLoot:0b,Health:12f,attributes:[{id:"minecraft:max_health",base:12d},{id:"minecraft:attack_damage",base:1d},{id:"minecraft:movement_speed",base:0.12d}],DeathLootTable:"minecraft:empty"}')
                threats[name]=dict(label=label,spawn=[x+.5,y,z+.5])
            return copy.deepcopy(threats[name])
        if action=='cleanup':
            self.command(f'kill @e[tag={tag}]');return {'ok':True}
        raise ValueError('Unknown survival lesson action.')
