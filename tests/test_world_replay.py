import pytest
from lab.world_replay import prepare_replay, ReplayReference


def test_replay_balances_fresh_samples_and_keeps_validation_out_of_training():
    rows=[([i],i%7) for i in range(15000)]
    train,validation,meta=prepare_replay(rows,100,42)
    assert len(validation)==512
    assert {r[0][0] for r in train}.isdisjoint(r[0][0] for r in validation)
    assert sum(r[0][0]>=14900 for r in train)==len(train)//2
    assert meta['fresh_world_examples']==100
    assert prepare_replay(rows,100,42)==(train,validation,meta)


def test_small_replay_keeps_earlier_examples_and_requires_fresh_data():
    train,validation,_=prepare_replay([([i],0) for i in range(100)],30)
    assert len(validation)==14 and any(r[0][0]<70 for r in train)
    with pytest.raises(ValueError):prepare_replay([([0],0)],0)


def test_long_teacher_overwrite_still_trains_on_history_and_validates_old_skills(tmp_path):
    from collections import deque
    reference=ReplayReference(tmp_path/'reference')
    live=deque([([float(i)],i%7) for i in range(15000)],maxlen=15000)
    reference.capture('expedition',257,list(live))
    live.extend(([float(i)],i%7) for i in range(15000,34123))
    # Every live row is now fresh, exactly the failure seen in round 257.
    assert all(row[0][0]>=15000 for row in live)
    reloaded=ReplayReference(tmp_path/'reference').load('expedition',257)
    train,validation,meta=prepare_replay(list(live),19123,257,reference=reloaded)
    assert meta['retained_examples']==14488 and meta['validation_examples']==512
    assert len(train)==8000 and sum(row[0][0]<15000 for row in train)==4000
    assert {r[0][0] for r in train}.isdisjoint(r[0][0] for r in validation)
    assert all(r[0][0]<15000 for r in validation)
    assert reference.load('expedition',257)==reloaded
    with pytest.raises(ValueError,match='Stale'):reference.load('expedition',258)
    with pytest.raises(ValueError,match='Missing'):reference.load('combat',257)


def test_empty_reference_is_explicit_cold_start_not_a_fabricated_validation(tmp_path):
    reference=ReplayReference(tmp_path);reference.capture('shelter',1,[])
    train,validation,meta=prepare_replay([([1.],0)],1,reference=reference.load('shelter',1))
    assert train and not validation and meta['retained_examples']==0
