"""Demand-driven, bounded inference telemetry; never part of replay or policy inputs."""
import copy
import threading
import time
import torch


class BrainView:
    def __init__(self, clock=time.time):
        self.clock=clock
        self.lock=threading.Lock()
        self.watch={}
        self.frames={}

    def request(self, agent):
        with self.lock:
            now=self.clock()
            self.watch={k:v for k,v in self.watch.items() if v>now}
            self.watch[agent]=now+5
            return copy.deepcopy(self.frames.get(agent))

    def wanted(self, agent):
        with self.lock:
            return self.watch.get(agent,0)>self.clock() and self.clock()-self.frames.get(agent,{}).get('at',-1e9)>=.45

    def infer(self, policy, observation, *, agent, skill, run, mode):
        if not self.wanted(agent):
            return policy(observation)
        # This is the same Linear -> Tanh -> Linear forward pass, captured once.
        hidden=policy.net[1](policy.net[0](observation))
        scores=policy.net[2](hidden)
        edges=[]
        for layer,linear,limit in ((0,policy.net[0],3),(1,policy.net[2],8)):
            weights=linear.weight.detach()
            for target,row in enumerate(weights):
                for source in row.abs().topk(min(limit,len(row))).indices.tolist():
                    edges.append([layer,source,target,float(row[source])])
        frame={'at':self.clock(),'agent':agent,'skill':skill,'run':run,'mode':mode,
               'inputs':observation.detach().tolist(),'hidden':hidden.detach().tolist(),
               'scores':scores.detach().tolist(),'probabilities':scores.detach().softmax(-1).tolist(),
               'policy_action':int(scores.argmax()),'edges':edges,'awaiting_action':True,
               'parameters':policy.parameters_count,'biases':[policy.net[0].bias.detach().tolist(),policy.net[2].bias.detach().tolist()]}
        with self.lock:
            self.frames[agent]=frame
        return scores

    def applied(self, agent, action):
        with self.lock:
            if agent in self.frames and self.frames[agent].pop('awaiting_action',False):
                self.frames[agent]['returned_action']=action
