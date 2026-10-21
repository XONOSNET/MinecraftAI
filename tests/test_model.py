import torch
from lab.model import Policy

def test_weight_update_and_checkpoint_roundtrip(tmp_path):
    torch.manual_seed(42)
    m=Policy();assert m.parameters_count==9604
    x=torch.randn(64,70);y=(x[:,64]>0).long();before=m(x).detach().clone()
    opt=torch.optim.Adam(m.parameters(),lr=.01)
    initial=torch.nn.functional.cross_entropy(m(x),y).item()
    for _ in range(20):
        loss=torch.nn.functional.cross_entropy(m(x),y);opt.zero_grad();loss.backward();opt.step()
    assert torch.nn.functional.cross_entropy(m(x),y).item()<initial
    assert not torch.equal(m(x),before)
    p=tmp_path/'weights.pt';torch.save(m.state_dict(),p)
    restored=Policy();restored.load_state_dict(torch.load(p,weights_only=True))
    assert torch.equal(m(x),restored(x))
