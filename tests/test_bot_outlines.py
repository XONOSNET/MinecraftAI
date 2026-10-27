import json
import pytest
from lab.bot_outlines import install_outline_pack


def test_outlines_target_configured_bots_and_only_apply_when_missing(tmp_path):
    install_outline_pack(tmp_path,8)
    tick=(tmp_path/'data/lab_outlines/function/tick.mcfunction').read_text()
    assert len(tick.splitlines())==8
    for i,line in enumerate(tick.splitlines()):
        assert f'@a[name=LabAI{i}]' in line
        assert 'unless data entity @s active_effects[{id:"minecraft:glowing"}]' in line
        assert line.endswith('effect give @s minecraft:glowing infinite 0 true')
    assert json.loads((tmp_path/'data/minecraft/tags/function/tick.json').read_text())['values']==['lab_outlines:tick']
    assert not any(term in tick for term in ('@a run','team ','clear ','kill '))


def test_pack_install_is_idempotent_and_rejects_invalid_bot_counts(tmp_path):
    install_outline_pack(tmp_path,8);p=tmp_path/'pack.mcmeta';stamp=p.stat().st_mtime_ns
    install_outline_pack(tmp_path,8);assert p.stat().st_mtime_ns==stamp
    for count in (0,11,True):
        with pytest.raises(ValueError):install_outline_pack(tmp_path,count)
