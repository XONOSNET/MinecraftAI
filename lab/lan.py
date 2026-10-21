"""Bounded LAN-only TCP bridge; Minecraft itself keeps its loopback binding."""
import asyncio
import contextlib
import ipaddress


class LanBridge:
    def __init__(self, host, subnet, port=25565, upstream_port=25565, max_connections=8):
        self.host = host
        self.subnet = ipaddress.ip_network(subnet)
        if ipaddress.ip_address(host) not in self.subnet:
            raise ValueError('LAN address must belong to the allowed subnet')
        self.port = port
        self.upstream_port = upstream_port
        self.max_connections = max_connections
        self.server = None
        self.clients = set()

    def allows(self, address):
        try:
            return ipaddress.ip_address(address) in self.subnet
        except ValueError:
            return False

    async def start(self):
        self.server = await asyncio.start_server(self._connect, self.host, self.port)

    def snapshot(self):
        return {'enabled': self.server is not None and self.server.is_serving(),
                'address': self.host, 'port': self.port, 'subnet': str(self.subnet),
                'connections': len(self.clients)}

    async def _connect(self, reader, writer):
        peer = writer.get_extra_info('peername')
        if not peer or not self.allows(peer[0]) or len(self.clients) >= self.max_connections:
            writer.close()
            with contextlib.suppress(Exception):await writer.wait_closed()
            return
        task = asyncio.current_task()
        self.clients.add(task)
        upstream = None
        pipes = []
        try:
            remote, upstream = await asyncio.wait_for(
                asyncio.open_connection('127.0.0.1', self.upstream_port), timeout=5)
            async def pipe(source, destination):
                while True:
                    data = await asyncio.wait_for(source.read(65536), timeout=120)
                    if not data:return
                    destination.write(data)
                    await destination.drain()
            pipes = [asyncio.create_task(pipe(reader, upstream)),
                     asyncio.create_task(pipe(remote, writer))]
            await asyncio.wait(pipes, return_when=asyncio.FIRST_COMPLETED)
        except (OSError, asyncio.TimeoutError):
            pass
        finally:
            for pipe_task in pipes:pipe_task.cancel()
            await asyncio.gather(*pipes, return_exceptions=True)
            for stream in (upstream, writer):
                if stream:
                    stream.close()
                    with contextlib.suppress(Exception):await stream.wait_closed()
            self.clients.discard(task)

    async def stop(self):
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        clients = list(self.clients)
        for task in clients:task.cancel()
        await asyncio.gather(*clients, return_exceptions=True)
