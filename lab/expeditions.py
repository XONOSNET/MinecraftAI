"""Fifty three-dimensional courses built from reusable, bounded lane geometry."""
import math
FAMILIES=[('swim','Swimming basics'),('stairs','Rock climbing steps'),('ladder','Ladder ascent'),('cave','Cave navigation'),('catwalk','Elevated catwalk'),('waterfall','Waterfall ascent'),('flooded','Flooded cave'),('cave_steps','Ascending cave'),('bent_catwalk','Turning catwalk'),('summit','Waterfall summit expedition')]
EXPEDITION_STAGES=[]
for family,title in FAMILIES:
 for level in range(1,6):
  EXPEDITION_STAGES.append(dict(name=f'{title} {level}',skill='expedition',task='expedition',difficulty=level,expedition=family,threshold=.8,examples_per_cycle=2000))

def spec(stage,seed,index,evaluation):
 import random
 rng=random.Random(seed);c=480 if evaluation else 320;z=index*12;family=stage['expedition'];level=stage['difficulty'];blocks=[];points=[]
 def box(x1,y1,z1,x2,y2,z2,material='stone'):
  blocks.append([c+x1,y1,z+z1,c+x2,y2,z+z2,material])
 def point(x,y=181.1,dz=.5):points.append([c+x,y,z+dz])
 start=[c-12.5,181.1,z+.5];water=False;min_safe=178
 if family in ('swim','flooded'):
  water=True;end=4+level
  box(-12,179,-3,12,179,3);box(-13,180,-4,13,185,-4);box(-13,180,4,13,185,4)
  for x in (-13,13):box(x,180,-3,x,185,3)
  box(-12,180,-3,12,182,3,'water');start=[c-9.5,182,z+.5]
  if family=='flooded':
   box(-12,185,-3,12,185,3,'deepslate');box(-6,185,0,-6,185,0,'sea_lantern');box(6,185,0,6,185,0,'sea_lantern')
   for j,x in enumerate(((-3,) if level==1 else (-3,4) if level<=3 else (-6,0,6))):
    gap=1 if j%2==0 else -1
    box(x,180,-3,x,184,3,'deepslate');box(x,180,gap if level==5 else gap-1,x,184,gap+(1 if level<3 else 0), 'water')
    route_z=gap if level in (3,4) else gap+.5
    point(x-2,182,route_z);point(x+2,182,route_z)
  else:
   for x in range(-6,end,4):point(x,182,(1.5 if (x//4)%2 else -.5) if level>=3 else .5)
  if level==5:
   box(9,180,-3,12,182,3,'oak_planks');point(7,182);point(10.5,183.1)
  else:point(end,182)
 elif family in ('ladder','waterfall','summit'):
  height=level*2;top=180+height;water=family!='ladder';start=[c-.5,181.1,z+.5]
  box(-2,179,-2,2,179,2)
  if water:
   for x in (-2,2):box(x,180,-2,x,top+2,2,'stone_bricks')
   for dz in (-2,2):box(-1,180,dz,1,top+2,dz,'glass' if dz==-2 else 'stone_bricks')
   box(-1,180,-1,1,top,1,'water[level=8]');box(-1,top,-1,1,top,1,'water');start=[c+.5,181,z+.5]
   box(2,top+1,-1,2,top+2,1,'air')
  else:
   box(1,180,-1,1,top,1,'stone_bricks');box(0,181,0,0,top,0,'ladder[facing=west]')
  box(1 if not water else 2,top,-1,9,top,2,'oak_planks')
  point(.6,top+.4);point(4,top+1.1)
  if family=='summit':
   box(5,top,-1,12,top,1,'stone');box(5,top+4,-2,12,top+4,2,'deepslate')
   box(8,top+1,-2,8,top+3,0,'deepslate');point(6,top+1.1,1.5);point(10,top+1.1,1.5)
  else:point(7,top+1.1)
 elif family in ('stairs','cave_steps'):
  height=level+1
  for i in range(height+1):
   x=-10+i*3;floor=180+i
   box(x,180,-2,x+2,floor,2,'cobblestone');point(x+1,floor+1.1)
   if family=='cave_steps':
    for dz in (-3,3):box(x,floor+1,dz,x+2,floor+4,dz,'deepslate')
    box(x,floor+5,-3,x+2,floor+5,3,'deepslate');box(x+1,floor+5,0,x+1,floor+5,0,'sea_lantern')
  x=-10+height*3;box(x,180,-2,x+5,180+height,2);point(x+4,181.1+height)
 elif family=='cave':
  box(-13,184,-4,13,184,4,'deepslate');box(-6,184,0,-6,184,0,'sea_lantern');box(6,184,0,6,184,0,'sea_lantern')
  for dz in (-4,4):box(-13,181,dz,13,183,dz,'deepslate')
  for j,x in enumerate((-6,2,9)[:min(3,1+level//2)]):
   gap=1 if j%2==0 else -1
   box(x,181,-3,x,183,3,'deepslate');box(x,181,gap if level==5 else gap-1,x,183,gap+(1 if level<3 else 0),'air')
   route_z=gap if level in (3,4) else gap+.5
   point(x-2,181.1,route_z);point(x+2,181.1,route_z)
  point(12)
 else:
  height=2+level;floor=180+height;width=3 if level==1 else 2 if level<=3 else 1;left=-(width//2);right=left+width-1;mid=(left+right+1)/2
  min_safe=floor-.5;start=[c-11.5,floor+1.1,z+mid]
  box(-13,floor,-2,-10,floor,2,'oak_planks')
  if family=='bent_catwalk':
   box(-10,floor,left,-3,floor,right,'oak_planks');box(-4,floor,-1,-2,floor,3,'oak_planks')
   box(-3,floor,0,0,floor,2,'oak_planks');box(-1,floor,1,1,floor,3,'oak_planks');box(0,floor,2+left,11,floor,2+right,'oak_planks')
   for x in (-9,-6,-3):point(x,floor+1.1,mid)
   point(-3,floor+1.1,2+mid);point(0,floor+1.1,2+mid)
   for x in (3,6,9,12):point(x,floor+1.1,2+mid)
   box(10,floor,1,14,floor,4,'oak_planks')
  else:
   box(-10,floor,left,12,floor,right,'oak_planks')
   for x in range(-9,13,3):point(x,floor+1.1,mid)
   box(11,floor,-2,14,floor,2,'oak_planks')
 goal=points[-1]
 return dict(kind='expedition',skill='expedition',difficulty=level,expedition=family,center=c,lane_z=z,feature_x=c,start=start,goal=goal,yaw=-math.pi/2+rng.uniform(-.1,.1),max_steps=600,reset_wait=1,
             checkpoint_radius=.45 if family=='flooded' else .65,bounds=[c-23,c+24,z-5,z+6],y_min=177,y_max=205,min_safe_y=min_safe,allow_water=water,waypoints=points,terrain_blocks=blocks,actual_doors=[],doors=[],coverage_target=24,wood_target=0,food_target=18)
