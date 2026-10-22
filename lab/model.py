import torch
from torch import nn
INPUTS=70
class Policy(nn.Module):
    def __init__(self,width=128,inputs=INPUTS,actions=4):
        super().__init__()
        self.net=nn.Sequential(nn.Linear(inputs,width),nn.Tanh(),nn.Linear(width,actions))
    def forward(self,x): return self.net(x)
    @property
    def parameters_count(self): return sum(p.numel() for p in self.parameters())
