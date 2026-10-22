"""Advanced courses: bounded bridges, real doors, and avoidable practice traps."""
ADVANCED_STAGES=[]
SPECS=[
 ('Wide bridge over water',dict(bridge=True,width=3)),
 ('Long bridge over water',dict(bridge=True,width=3,length=24)),
 ('Narrow bridge crossing',dict(bridge=True,width=2,length=24)),
 ('Offset bridge approach',dict(bridge=True,width=3,offset=2)),
 ('Bridge with a turn',dict(bridge=True,width=3,bend=True)),
 ('Open a wooden door',dict(door_count=1)),
 ('Open two wooden doors',dict(door_count=2)),
 ('Offset closed doorway',dict(door_count=1,offset=2)),
 ('Alternating closed doorways',dict(door_count=2,alternate=True)),
 ('Avoid a shallow water pit',dict(traps=1)),
 ('Avoid two shallow pits',dict(traps=2)),
 ('Magma trap detour',dict(traps=1,magma=True)),
 ('Alternating trap detours',dict(traps=2,alternate=True)),
 ('Hurdle before a trap',dict(traps=1,hurdle=True)),
 ('Door before a bridge',dict(door_count=1,bridge=True,width=3)),
 ('Bridge then closed door',dict(door_count=1,bridge=True,width=2,late_door=True)),
 ('Door and trap sequence',dict(door_count=1,traps=1)),
 ('Two doors and a narrow bridge',dict(door_count=2,bridge=True,width=2)),
 ('Door hurdle and magma trap',dict(door_count=1,traps=1,magma=True,hurdle=True)),
 ('Advanced bridge door gauntlet',dict(door_count=2,bridge=True,width=2,bend=True)),
]
for index,(name,features) in enumerate(SPECS):
 ADVANCED_STAGES.append(dict(name=name,skill='advanced',task='advanced',difficulty=4+index//5,features=features,threshold=.8))

def layout(features,c,z):
 blocks=[];points=[];doors=[]
 def block(x1,y1,z1,x2,y2,z2,name):blocks.append([c+x1,y1,z+z1,c+x2,y2,z+z2,name])
 offset=features.get('offset',0)
 if features.get('bridge'):
  length=features.get('length',20);lo=-length//2;hi=length//2
  block(lo,180,-4,hi,180,4,'water')
  width=features.get('width',3);left=-(width//2);right=left+width-1
  if features.get('bend'):
   block(lo,180,left,0,180,right,'oak_planks');block(-2,180,left,2,180,3,'oak_planks');block(0,180,2,hi,180,3,'oak_planks')
   points=[[c+lo-2,181.1,z+.6],[c-1,181.1,z+.6],[c,181.1,z+2.6],[c+hi+2,181.1,z+2.6]]
  else:
   block(lo,180,left+offset,hi,180,right+offset,'oak_planks')
   mid=offset+(left+right+1)/2
   # Door approach/exit checkpoints must finish before steering onto/off the deck.
   approach=lo+1 if features.get('door_count') and not features.get('late_door') else lo-2
   exit=hi-1 if features.get('door_count') else hi+2
   points=[[c+approach,181.1,z+mid],[c+exit,181.1,z+mid]]
 for j in range(features.get('traps',0)):
  x=0+j*8;side=-1 if features.get('alternate') and j%2 else 1
  block(x-1,180,-1,x+1,180,1,'magma_block' if features.get('magma') else 'water')
  points.extend([[c+x-3,181.1,z+side*3],[c+x+3,181.1,z+side*3]])
 if features.get('hurdle'):block(-5,181,-5,-5,181,5,'oak_planks')
 for j in range(features.get('door_count',0)):
  x=(12 if features.get('late_door') else -13) if features.get('bridge') else (-12 if features.get('door_count')==1 else -10+j*20)
  if features.get('bridge') and j:x=13
  gap=(-2 if features.get('alternate') and j%2 else offset)
  if features.get('bridge') and features.get('bend') and x>0:gap=2
  block(x,181,-5,x,183,5,'oak_planks');block(x,181,gap,x,182,gap,'air')
  doors.append([c+x,z+gap])
  block(x,181,gap,x,181,gap,'oak_door[facing=east,half=lower,hinge=left,open=false]')
  block(x,182,gap,x,182,gap,'oak_door[facing=east,half=upper,hinge=left,open=false]')
  points.extend([[c+x-2,181.1,z+gap+.6],[c+x+2,181.1,z+gap+.6]])
 points.sort(key=lambda p:p[0])
 exit_z=points[-1][2] if features.get('bridge') and not features.get('door_count') else z+.6
 points.append([c+16,181.1,exit_z])
 return blocks,points,doors
