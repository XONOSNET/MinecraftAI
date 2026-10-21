import asyncio
from lab.lan import LanBridge


def test_lan_scope_rejects_other_networks():
    bridge=LanBridge('192.168.1.24','192.168.1.0/24')
    assert bridge.allows('192.168.1.50')
    assert not bridge.allows('192.168.2.50')
    assert not bridge.allows('8.8.8.8')
    assert not bridge.allows('127.0.0.1')
    assert not bridge.allows('::1')


def test_bridge_forwards_bytes_and_rejects_disallowed_clients():
    async def exercise():
        async def echo(reader,writer):
            try:
                while data:=await reader.read(65536):
                    writer.write(data);await writer.drain()
            finally:
                writer.close();await writer.wait_closed()
        server=await asyncio.start_server(echo,'127.0.0.1',0)
        bridge=LanBridge('127.0.0.1','127.0.0.0/8',port=0,
                         upstream_port=server.sockets[0].getsockname()[1])
        await bridge.start()
        port=bridge.server.sockets[0].getsockname()[1]
        try:
            reader,writer=await asyncio.open_connection('127.0.0.1',port)
            payload=b'Minecraft LAN test'*4000
            writer.write(payload);await writer.drain()
            assert await asyncio.wait_for(reader.readexactly(len(payload)),2)==payload
            writer.close();await writer.wait_closed()
            bridge.subnet=__import__('ipaddress').ip_network('192.0.2.0/24')
            reader,writer=await asyncio.open_connection('127.0.0.1',port)
            assert await asyncio.wait_for(reader.read(1),2)==b''
            writer.close();await writer.wait_closed()
        finally:
            await bridge.stop();server.close();await server.wait_closed()
    asyncio.run(exercise())
