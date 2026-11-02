from lab.sleep_quorum import SleepQuorum,install_pack


def trial():
    return dict(active=True,phase='running',first_night={'hostiles':True},bots=[f'LabAI{i}' for i in range(8)],results={})


def test_stopped_and_completed_bots_do_not_block_remaining_sleepers():
    commands=[];q=SleepQuorum(commands.append);s=trial()
    s['results']={'LabAI0':{'state':'stopped'},'LabAI1':{'state':'complete'}}
    q.tick(s,0)
    assert commands==['scoreboard players set #required lab_sleep 6','function lab_sleep:update']
    q.tick(s,1);assert len(commands)==2
    q.tick(s,10);assert len(commands)==4
    s['results']['LabAI2']={'state':'stopped'};q.tick(s,11)
    assert commands[-2]=='scoreboard players set #required lab_sleep 5'


def test_normal_rule_restored_after_trial_and_intentional_pause():
    for end in ('paused','finished'):
        commands=[];q=SleepQuorum(commands.append);s=trial();q.tick(s,0)
        s.update(active=False,phase=end);q.tick(s,1)
        assert commands[-1]=='function lab_sleep:restore'
        q.tick(s,2);assert commands.count('function lab_sleep:restore')==1
    commands=[];SleepQuorum(commands.append).tick(None,0);assert commands==[]


def test_pack_counts_actual_players_and_preserves_original_rule(tmp_path):
    install_pack(tmp_path)
    update=(tmp_path/'data/lab_sleep/function/update.mcfunction').read_text()
    assert '@a[gamemode=!spectator]' in update
    assert 'unless score #saved lab_sleep matches 1 store result score #original' in update
    restore=(tmp_path/'data/lab_sleep/function/restore.mcfunction').read_text()
    assert 'scoreboard players get #original lab_sleep' in restore
    assert 'function lab_sleep:apply with storage lab:sleep' in restore
    assert '$gamerule playersSleepingPercentage $(percentage)' in (tmp_path/'data/lab_sleep/function/apply.mcfunction').read_text()
    import math
    for online in range(1,13):
        for active in range(1,online+1):
            assert math.ceil(online*(active*100//online)/100)==active
