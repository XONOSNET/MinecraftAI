"""Shared deployment limits; changes take effect when the lab restarts."""
import json
from pathlib import Path

def validate_agents(config):
    count=config.get('count')
    episodes=config.get('episodes_per_agent')
    if type(count) is not int or not 1<=count<=10:
        raise ValueError('Agent count must be an integer from 1 to 10')
    if type(episodes) is not int or not 1<=episodes<=10:
        raise ValueError('Episodes per agent must be an integer from 1 to 10')
    return count,episodes

AGENT_COUNT,EPISODES_PER_AGENT=validate_agents(json.loads((Path(__file__).resolve().parents[1]/'config/agents.json').read_text()))
EXPECTED_EPISODES=AGENT_COUNT*EPISODES_PER_AGENT
LANE_END=(AGENT_COUNT-1)*12+6
def is_agent(name):
    return isinstance(name,str) and name in {f'LabAI{i}' for i in range(AGENT_COUNT)}
