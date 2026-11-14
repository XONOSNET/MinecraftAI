"""Direct loopback research-fixture health checks without the dashboard state lock."""

import math
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse


PROTOCOL = 'fixture-health-v1'
PATH = '/fixture/health'
HOST = 'localhost:8000'


def fixture_health(process, ready_seen, lifecycle, agents, memory, persistence, world, learning, mode, stopped,
                   clock=time.time):
    """Sample the owned process and current in-memory health signals, with no I/O to historical stores."""
    owned = process()
    flags = lifecycle()
    now = clock()
    bots = sum(agent.get('connected', True) and now - agent.get('last_seen', 0) < 8
               for agent in agents())
    ram = memory()
    backlog = persistence()
    session = world()
    state = learning()
    world_view = ({field: session.get(field) for field in ('run', 'phase', 'progress')}
                  if session is not None else None)
    learning_view = {field: state.get(field) for field in ('run', 'phase', 'round', 'phase_at', 'restore_pending')}
    lab_mode = mode()
    intentional_stop = stopped()

    pending = backlog.get('pending')
    capacity = backlog.get('capacity')
    if (type(ram) not in (int, float) or not math.isfinite(ram) or not 0 <= ram <= 100 or
            type(pending) is not int or pending < 0 or type(capacity) is not int or capacity < 1 or
            'error' not in backlog or (backlog['error'] is not None and not isinstance(backlog['error'], str))):
        raise RuntimeError('Missing or invalid fixture health telemetry')

    # Capture only a process this service still owns. Recheck lifecycle and
    # process identity around the ready sample to reject concurrent restarts.
    ready = bool(owned is not None and ready_seen() and owned.poll() is None)
    if flags != lifecycle() or process() is not owned or intentional_stop != stopped():
        raise RuntimeError('Minecraft lifecycle changed during the fixture health sample')

    return {'protocol': PROTOCOL, 'sampled_at_ms': int(now * 1000),
            'server': {'pid': owned.pid if ready else None, 'ready': ready, 'busy': flags['busy'],
                       'desired_running': flags['desired_running'], 'error': flags['error'],
                       'phase': flags['phase'], 'bots_online': bots if ready else 0},
            'ram_percent': ram, 'performance': {'persistence': dict(pending=pending, capacity=capacity, error=backlog['error'])},
            'stopped': intentional_stop,
            'world_training': {'session': world_view}, 'world_learning': learning_view, 'mode': lab_mode}


def fixture_health_router(sample):
    router = APIRouter()

    @router.get(PATH, include_in_schema=False)
    def health(request: Request):
        # The LAN HTTPS frontend rewrites this header to 127.0.0.1:8000.
        # Requiring the direct fixture authority keeps this route off that proxy.
        if request.client is None or request.client.host not in ('127.0.0.1', '::1') or request.headers.get('host') != HOST:
            raise HTTPException(404)
        try:
            payload = sample()
        except (OSError, RuntimeError) as error:
            raise HTTPException(503, str(error)) from None
        return JSONResponse(payload, headers={'Cache-Control': 'no-store'})

    return router
