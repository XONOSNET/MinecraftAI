import pytest
from lab.admin import build_admin_command


def test_player_commands_use_canonical_names_and_allow_only_known_actions():
    names=['Xonosnet','LabAI0']
    assert build_admin_command({'action':'op','player':'xonosnet'},names,names)=='op Xonosnet'
    assert build_admin_command({'action':'teleport','player':'Xonosnet','destination':'LabAI0'},names,names)=='tp Xonosnet LabAI0'
    assert build_admin_command({'action':'gamemode','player':'Xonosnet','gamemode':'spectator'},names,names)=='gamemode spectator Xonosnet'
    assert build_admin_command({'action':'deop','player':'Xonosnet'},names,[])=='deop Xonosnet'


@pytest.mark.parametrize('payload',[
    {'action':'op','player':'Xonosnet\nop LabAI0'},
    {'action':'gamemode','player':'Xonosnet','gamemode':'creative\nstop'},
    {'action':'teleport','player':'Xonosnet','destination':'Unknown'},
    {'action':'teleport-coordinates','player':'Xonosnet','x':'nan','y':181,'z':0},
    {'action':'teleport-coordinates','player':'Xonosnet','x':0,'y':99999,'z':0},
    {'action':'stop','player':'Xonosnet'},
])
def test_bad_admin_requests_cannot_become_console_commands(payload):
    with pytest.raises(ValueError):build_admin_command(payload,['Xonosnet','LabAI0'],['Xonosnet','LabAI0'])
