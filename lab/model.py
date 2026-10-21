import torch
from torch import nn
INPUTS=70
class Policy(nn.Module):
    def __init__(self,width=128):
        super().__init__()
        self.net=nn.Sequential(nn.Linear(INPUTS,width),nn.Tanh(),nn.Linear(width,4))
    def forward(self,x): return self.net(x)
    @property
    def parameters_count(self): return sum(p.numel() for p in self.parameters())
