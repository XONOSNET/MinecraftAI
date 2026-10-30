"""Bounded, ordered disk writes outside the live controller lock."""
import json
import logging
import os
import queue
import sqlite3
import threading
import time
from pathlib import Path
import numpy as np


class TelemetryPersistence:
    def __init__(self, database, capacity=2048):
        self.database=str(database);self.queue=queue.Queue(capacity);self.error=None;self.closed=False
        self.condition=threading.Condition();self.pending=0;self.files={};self.db=None;self.documents={}
        self.thread=threading.Thread(target=self._run,name='lab-persistence',daemon=True);self.thread.start()

    def submit(self, job):
        with self.condition:
            if self.closed:raise RuntimeError('Persistence writer is closed')
            self._check();self.pending+=1
        while True:
            try:self.queue.put(job,timeout=.1);return
            except queue.Full:
                self._check()

    def _check(self):
        if self.error:raise RuntimeError('Persistence writer failed: '+str(self.error)) from self.error

    def document(self,path,data):
        key=str(path)
        with self.condition:
            self._check()
            if self.closed:raise RuntimeError('Persistence writer is closed')
            if key in self.documents:self.documents[key]=data;return
            self.documents[key]=data
        self.submit(('document',key))

    def step(self, row):
        self.submit(('step',row))

    def replay(self, path, samples, version=None, parameters=None, metadata=None):
        # The caller freezes the bounded deque; observation rows are immutable.
        self.submit(('replay',(str(path),list(samples),version,parameters,str(metadata) if metadata else None)))

    def snapshot(self):
        with self.condition:return dict(pending=self.pending,capacity=self.queue.maxsize,error=str(self.error) if self.error else None)

    def flush(self, timeout=60):
        end=time.monotonic()+timeout
        with self.condition:
            while self.pending:
                self._check();remaining=end-time.monotonic()
                if remaining<=0:raise TimeoutError('Persistence flush timed out')
                self.condition.wait(min(.1,remaining))
            self._check()

    def close(self):
        with self.condition:self.closed=True
        self.flush()
        self.queue.put(None);self.thread.join(timeout=10)
        if self.thread.is_alive():raise RuntimeError('Persistence writer did not stop')

    def _step(self, row):
        self.db.execute('INSERT OR IGNORE INTO agents VALUES(?,?,?)',(row['agent'],row['profile'],'{}'))
        self.db.execute('UPDATE agents SET state=? WHERE id=?',(row['state'],row['agent']))
        self.db.executemany('INSERT OR REPLACE INTO memory VALUES(?,?,?,?,?,?)',row['hits'])
        path=Path(row['trajectory']);stream=self.files.get(str(path))
        if stream is None:
            stream=path.open('ab');self.files[str(path)]=stream
        if stream.tell()>100_000_000:
            stream.close();os.replace(path,path.with_name(path.stem+'-previous.f32'));stream=path.open('ab');self.files[str(path)]=stream
        stream.write(row['transition'])

    def _replay(self, payload):
        path,samples,version,parameters,metadata=payload
        if not samples:return
        path=Path(path);temporary=path.with_suffix('.async.tmp')
        data=dict(obs=np.asarray([s[0] for s in samples],dtype=np.float32),actions=np.asarray([s[1] for s in samples]))
        if version is not None:data['observation_version']=version
        with temporary.open('wb') as stream:np.savez_compressed(stream,**data)
        os.replace(temporary,path)
        if metadata:
            dest=Path(metadata);tmp=dest.with_suffix('.async-meta.tmp')
            tmp.write_text(json.dumps(dict(samples=len(samples),parameters=parameters,updated_at=time.time())),encoding='utf-8');os.replace(tmp,dest)

    def _run(self):
        try:
            self.db=sqlite3.connect(self.database,timeout=10)
            while True:
                first=self.queue.get()
                if first is None:break
                batch=[first]
                deadline=time.monotonic()+.05
                for _ in range(31):
                    remaining=deadline-time.monotonic()
                    if remaining<=0:break
                    try:batch.append(self.queue.get(timeout=remaining))
                    except queue.Empty:break
                for kind,payload in batch:
                    # Compression must never extend a SQLite write transaction.
                    if kind=='replay':
                        self.db.commit();self._replay(payload)
                    elif kind=='document':
                        self.db.commit()
                        with self.condition:data=self.documents.pop(payload)
                        path=Path(payload);tmp=path.with_suffix('.async.tmp')
                        tmp.write_text(json.dumps(data,indent=2),encoding='utf-8');os.replace(tmp,path)
                    else:self._step(payload)
                self.db.commit()
                for stream in self.files.values():stream.flush()
                with self.condition:self.pending-=len(batch);self.condition.notify_all()
        except Exception as error:
            logging.getLogger(__name__).exception('Telemetry persistence failed')
            if self.db:self.db.rollback()
            with self.condition:self.error=error;self.condition.notify_all()
        finally:
            for stream in self.files.values():stream.close()
            if self.db:self.db.close()
