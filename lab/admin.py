"""Small, validated player-administration command set. No arbitrary console input."""
import math
import re


def build_admin_command(request,known,online):
    known={name.casefold():name for name in known}
    online={name.casefold():name for name in online}
    def player(value,must_be_online=False):
        if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9_]{3,16}',value):
            raise ValueError('Choose a valid Minecraft player name')
        roster=online if must_be_online else known
        if value.casefold() not in roster:
            raise ValueError('That player is not online' if must_be_online else 'That player is not in the known player list')
        return roster[value.casefold()]
    action=request.get('action')
    name=player(request.get('player'),action not in ('op','deop'))
    if action in ('op','deop'):return f'{action} {name}'
    if action=='gamemode':
        mode=request.get('gamemode')
        if mode not in ('survival','creative','adventure','spectator'):raise ValueError('Choose a valid game mode')
        return f'gamemode {mode} {name}'
    if action=='teleport':return f"tp {name} {player(request.get('destination'),True)}"
    if action=='teleport-coordinates':
        try:coords=[float(request[key]) for key in ('x','y','z')]
        except (KeyError,ValueError,TypeError):raise ValueError('Enter numeric X, Y and Z coordinates')
        if not all(math.isfinite(value) for value in coords):raise ValueError('Coordinates must be finite numbers')
        if abs(coords[0])>29999984 or abs(coords[2])>29999984 or not -64<=coords[1]<=1024:
            raise ValueError('Coordinates are outside the supported world limits')
        return f"tp {name} "+' '.join(f'{value:.4f}' for value in coords)
    if action=='heal':return f'effect give {name} minecraft:instant_health 1 5 true'
    if action=='feed':return f'effect give {name} minecraft:saturation 1 5 true'
    if action=='kick':return f'kick {name} Disconnected by the lab administrator.'
    raise ValueError('Unknown player administration action')
