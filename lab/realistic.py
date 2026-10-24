"""Natural-looking bounded terrain, buildings and volcanic traversal courses."""
import math
import random

COURSES=[
 ('Meadow foothill trail',2,'rolling',{},5),
 ('Woodland roots and fallen logs',2,'rolling',{'roots':True,'trees':True},5),
 ('Eroded hillside switchback',4,'ridge',{'turns':True},5),
 ('Pass through a meadow cottage',1,'flat',{'houses':[-2]},5),
 ('Rocky gully climb',4,'ridge',{'rock':True},6),
 ('Creek bank stone crossing',2,'rolling',{'creek':True},6),
 ('Cross a two-house hamlet',1,'flat',{'houses':[-8,5],'turns':True},6),
 ('Climb to a hillside stone house',4,'rise',{'houses':[6],'rock':True},6),
 ('Skirt a contained lava spring',2,'flat',{'lava':True,'turns':True},6),
 ('Jump a rocky ravine',4,'flat',{'gaps':[-1],'rock':True},6),
 ('Steep scree staircase',7,'steep',{'rock':True},7),
 ('High woodland ridge traverse',5,'ridge',{'trees':True,'roots':True,'turns':True},7),
 ('Enter a ruined hilltop house',5,'rise',{'houses':[6],'roots':True,'rock':True},7),
 ('Basalt causeway over lava',4,'flat',{'lava':True,'narrow':True},7),
 ('Jump a lava fissure',4,'flat',{'lava':True,'gaps':[-1],'rock':True},7),
 ('Two lava fissures and rubble',4,'flat',{'lava':True,'gaps':[-6,5],'roots':True,'rock':True},8),
 ('Alpine ledge and abandoned cabin',6,'ridge',{'houses':[4],'narrow':True,'rock':True},8),
 ('Volcanic hillside ascent',7,'steep',{'lava':True,'rock':True},8),
 ('Lava village escape route',4,'flat',{'houses':[-9,7],'lava':True,'gaps':[-1],'rock':True},8),
 ('Mountain village summit expedition',8,'steep',{'houses':[7],'roots':True,'trees':True,'rock':True},8),
]
REALISTIC_STAGES=[dict(name=name,skill='expedition',task='expedition',expedition='realistic',realistic=i,difficulty=height,terrain_profile=profile,features=features,tier=tier,threshold=.8,examples_per_cycle=2500) for i,(name,height,profile,features,tier) in enumerate(COURSES)]

def spec(stage,seed,index,evaluation):
 rng=random.Random(seed);c=480 if evaluation else 320;z=index*12;features=stage['features'];height=stage['difficulty'];profile=stage['terrain_profile'];blocks=[]
 def box(x1,y1,z1,x2,y2,z2,material):blocks.append([c+x1,y1,z+z1,c+x2,y2,z+z2,material])
 def level(x):
  if profile=='flat':return height
  if profile=='rolling':return max(0,height-int(abs(x)/5))
  if profile=='ridge':return max(0,height-max(0,(abs(x)-3)//2))
  if profile=='steep':return min(height,max(0,(x+13)//2))
  return min(height,max(0,(x+12)//3))
 # Houses sit on a level terrace, rather than clipping through a hill.
 house_floor={hx:level(hx) for hx in features.get('houses',[])}
 def floor(x):
  for hx,h in house_floor.items():
   if hx-3<=x<=hx+3:return 180+h
  return max(181 if features.get('lava') or features.get('creek') else 180,180+level(x))
 def lateral(x):return (1 if x<0 else -1) if features.get('turns') else 0
 material='stone' if features.get('rock') else 'grass_block'
 for x in range(-20,21):
  y=floor(x);side=lateral(x)
  box(x,179,-5,x,y-1,5,'stone' if features.get('rock') else 'dirt')
  box(x,y,-5,x,y,5,material)
  if features.get('lava') or features.get('creek'):
   box(x,180,-4,x,max(180,y-1),4,'air')
   box(x,180,-4,x,180,4,'lava' if features.get('lava') else 'water')
   # Stone-lined basin and nonflammable deck contain both fluids.
   for edge in (-5,5):box(x,180,edge,x,max(181,y),edge,'stone_bricks')
   width=0 if features.get('narrow') else 1
   box(x,181,side-width,x,y,side+width,'polished_basalt' if features.get('lava') else 'cobblestone')
  else:
   box(x,y,side-1,x,y,side+1,'coarse_dirt' if not features.get('rock') else 'gravel')
 # Decorative trees outside the traversable trail; no leaves obstruct the route.
 if features.get('trees'):
  for x,dz in ((-12,-4),(-4,4),(12,-4)):
   y=floor(x);box(x,y+1,dz,x,y+3,dz,'oak_log');box(x-1,y+4,max(-5,dz-1),x+1,y+5,min(5,dz+1),'oak_leaves[persistent=true]')
 # Actual walled houses with windows, roofs, interior and entrance/exit portals.
 for hx,h in house_floor.items():
  y=180+h
  box(hx-3,y,-4,hx+3,y,4,'stone_bricks' if features.get('lava') else 'oak_planks')
  for edge in (-4,4):box(hx-3,y+1,edge,hx+3,y+3,edge,'stone_bricks')
  for edge in (hx-3,hx+3):
   box(edge,y+1,-4,edge,y+3,4,'stone_bricks');box(edge,y+1,-1,edge,y+2,1,'air')
  for edge in (-4,4):box(hx-1,y+2,edge,hx+1,y+2,edge,'glass_pane')
  for edge in range(-4,5):box(hx-3,y+4+(3-abs(edge))//2,edge,hx+3,y+4+(3-abs(edge))//2,edge,'stone_bricks' if features.get('lava') else 'spruce_planks')
  box(hx,y+3,3,hx,y+3,3,'lantern[hanging=true]')
 # Mandatory one-block hurdles require a jump rather than a visual decoration.
 roots=[]
 if features.get('roots'):
  roots=[x for x in (-16,-10,-4,0,8,12) if floor(x-1)==floor(x)==floor(x+1) and not any(abs(x-hx)<=4 for hx in house_floor)][:2]
  for x in roots:
   y=floor(x);box(x,y+1,-4,x,y+1,4,'cobblestone' if features.get('lava') else 'oak_log[axis=z]')
 for x in features.get('gaps',[]):
  box(x,181,-4,x,floor(x),4,'air')
  # A raised natural stepping stone forces a one-block jump and provides a
  # stable landing instead of relying on a perfectly timed running leap.
  box(x,181,0,x,floor(x)+1,0,'basalt' if features.get('lava') else 'stone')
 points=[]
 for x in range(-16,18,2):
  if any(abs(x-obstacle)<2.5 for obstacle in [*features.get('gaps',[]),*roots]):continue
  points.append([c+x+.5,floor(x)+1.1,z+lateral(x)+.5])
 # Center the approach and exit waypoints on each house's three-block portal.
 for point in points:
  if any(abs(point[0]-c-hx)<=4 for hx in house_floor):point[2]=z+.5
 start=[c-18.5,floor(-19)+1.1,z+lateral(-19)+.5]
 return dict(kind='expedition',skill='expedition',expedition='realistic',realistic=stage['realistic'],difficulty=height,center=c,lane_z=z,feature_x=c,start=start,goal=points[-1],yaw=-math.pi/2+rng.uniform(-.07,.07),max_steps=900,reset_wait=1,checkpoint_radius=.75,bounds=[c-23,c+24,z-5,z+6],y_min=177,y_max=211,min_safe_y=180.4 if features.get('gaps') else 178,allow_water=False,waypoints=points,terrain_blocks=blocks,actual_doors=[],doors=[],coverage_target=24,wood_target=0,food_target=18,gap_edges=[c+x for x in features.get('gaps',[])],jump_gaps=bool(features.get('gaps')),required_jumps=1 if features.get('gaps') or features.get('roots') else 0)
