"""Graceful Minecraft lifecycle operations that leave the dashboard available."""
import copy
import threading
import time


class ServerControl:
    def __init__(self, launch, stop, prepare, alive, ready, on_event=lambda *args: None,
                 startup_timeout=120):
        self.launch, self.stop, self.prepare = launch, stop, prepare
        self.alive, self.ready, self.on_event = alive, ready, on_event
        self.startup_timeout = startup_timeout
        self._lock = threading.Lock()
        self._done = threading.Event()
        self._done.set()
        self._state = {'phase':'starting','busy':False,'desired_running':True,
                       'message':'Starting Minecraft. The dashboard remains available.',
                       'action':None,'error':None}

    def _update(self, **fields):
        with self._lock:self._state.update(fields)

    def snapshot(self):
        with self._lock:state=copy.deepcopy(self._state)
        alive=self.alive()
        ready=alive and self.ready()
        if not state['busy'] and not state['error']:
            state['phase']='online' if ready else 'starting' if alive else 'crashed' if state['desired_running'] else 'stopped'
            state['message']={'online':'Minecraft is ready. Bots and LAN players can connect.',
                              'starting':'Minecraft is preparing the persistent world.',
                              'crashed':'Minecraft exited unexpectedly. Check the activity log.',
                              'stopped':'Minecraft is stopped. The dashboard stays available so you can start it again.'}[state['phase']]
        state.update(alive=alive,ready=bool(ready))
        if state.get('started_at'):
            state['elapsed_seconds']=(state.get('finished_at') or time.time())-state['started_at']
        return state

    def request(self, action, automatic=False):
        if action not in ('start','stop','restart'):raise ValueError('Unknown server action')
        with self._lock:
            if self._state['busy']:raise RuntimeError('A server operation is already in progress')
            self._state.update(action=action,automatic=automatic,phase='saving',busy=True,error=None,
                               desired_running=action!='stop',started_at=time.time(),finished_at=None,
                               message='Pausing learning and saving examples and the model checkpoint.')
            self._done.clear()
        threading.Thread(target=self._run,args=(action,),daemon=True,name='minecraft-lifecycle').start()
        return self.snapshot()

    def _run(self, action):
        try:
            self.on_event('server_operation_started',{'action':action})
            self.prepare()
            if action in ('stop','restart') and self.alive():
                self._update(phase='stopping',message='Saving the Minecraft world and disconnecting players safely.')
                self.stop()
            if action in ('start','restart'):
                if not self.alive():self.launch()
                self._update(phase='starting',message='Starting Minecraft and loading the saved world. The AI bots reconnect automatically.')
                deadline=time.monotonic()+self.startup_timeout
                while not self.ready():
                    if not self.alive():raise RuntimeError('Minecraft exited during startup. Check the server log.')
                    if time.monotonic()>deadline:raise TimeoutError('Minecraft did not become ready within the startup timeout.')
                    time.sleep(.2)
            self._update(phase='online' if action!='stop' else 'stopped',busy=False,finished_at=time.time())
            self.on_event('server_operation_completed',{'action':action})
        except Exception as error:
            self._update(phase='failed',busy=False,error=str(error),finished_at=time.time(),
                         message='The server operation needs attention: '+str(error))
            self.on_event('server_operation_failed',{'action':action,'error':str(error)})
        finally:self._done.set()

    def wait(self, timeout=None):
        self._done.wait(timeout)
        return self.snapshot()
