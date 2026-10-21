"""Read Minecraft's own status response without a player login."""
import json
import socket
import struct


def varint(value):
    result=bytearray()
    while True:
        byte=value&127;value>>=7;result.append(byte|(128 if value else 0))
        if not value:return bytes(result)


def read_exact(stream,size):
    data=b''
    while len(data)<size:
        part=stream.recv(size-len(data))
        if not part:raise OSError('Minecraft closed the status connection')
        data+=part
    return data


def read_varint(stream):
    value=0
    for index in range(5):
        byte=read_exact(stream,1)[0];value|=(byte&127)<<(index*7)
        if byte<128:return value
    raise ValueError('Invalid Minecraft status framing')


def query_status(host='127.0.0.1',port=25565,timeout=.5):
    encoded=host.encode('utf-8')
    handshake=varint(0)+varint(769)+varint(len(encoded))+encoded+struct.pack('>H',port)+varint(1)
    with socket.create_connection((host,port),timeout=timeout) as stream:
        stream.sendall(varint(len(handshake))+handshake+b'\x01\x00')
        length=read_varint(stream)
        if not 0<length<1048576:raise ValueError('Unexpected Minecraft status size')
        if read_varint(stream)!=0:raise ValueError('Unexpected Minecraft status packet')
        text_length=read_varint(stream)
        if text_length>length:raise ValueError('Invalid Minecraft status length')
        return json.loads(read_exact(stream,text_length).decode('utf-8'))
