import pytest
from lab.world_replay import prepare_replay


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
