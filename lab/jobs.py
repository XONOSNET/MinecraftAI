"""Thread-safe progress for one bounded, cancellable training job."""
import copy
import threading
import time
import uuid


class TrainingCancelled(Exception):
    pass


class TrainingJobs:
    def __init__(self):
        self._lock = threading.Lock()
        self._done = threading.Event()
        self._cancel = threading.Event()
        self._state = {"id": None, "status": "idle", "phase": "idle", "percent": 0}

    def snapshot(self):
        with self._lock:
            state = copy.deepcopy(self._state)
        if state.get("started_at"):
            state["elapsed_seconds"] = (state.get("finished_at") or time.time()) - state["started_at"]
        return state

    @property
    def running(self):
        return self.snapshot()["status"] in ("running", "cancelling")

    def start(self, work, **metadata):
        with self._lock:
            if self._state["status"] in ("running", "cancelling"):
                raise RuntimeError("Training is already in progress")
            self._cancel.clear()
            self._done.clear()
            self._state = dict(metadata, id=uuid.uuid4().hex, status="running",
                               phase="preparing", percent=0, started_at=time.time(),
                               message="Pausing bot movement and preparing the collected examples.")
        threading.Thread(target=self._run, args=(work,), daemon=True, name="lab-training").start()
        return self.snapshot()

    def update(self, **fields):
        with self._lock:
            self._state.update(fields)

    def begin_saving(self):
        # Cancellation and the commit boundary must be decided under one lock.
        with self._lock:
            if self._cancel.is_set():
                raise TrainingCancelled()
            self._state.update(phase="saving",percent=97,
                               message="Saving the learned weights and a recovery checkpoint.")

    def _run(self, work):
        try:
            result = work(self.update, self._cancel)
            self.update(status="completed", phase="completed", percent=100,
                        result=result, finished_at=time.time(),
                        message="Training finished and the checkpoint is saved. Test the learned behavior next.")
        except TrainingCancelled:
            self.update(status="cancelled", phase="cancelled", finished_at=time.time(),
                        message="Training cancelled. The previously saved model is still active.")
        except Exception as error:
            self.update(status="failed", phase="failed", error=str(error), finished_at=time.time(),
                        message="Training failed. Your collected examples and previous model are preserved.")
        finally:
            self._done.set()

    def cancel(self):
        with self._lock:
            if self._state["status"] not in ("running", "cancelling"):
                return False
            if self._state["phase"] == "saving":
                return False
            self._cancel.set()
            self._state.update(status="cancelling", message="Cancellation requested. Finishing the current batch.")
            return True

    def wait(self):
        self._done.wait()
        return self.snapshot()
