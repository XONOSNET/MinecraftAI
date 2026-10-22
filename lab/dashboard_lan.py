"""Subnet-restricted HTTPS frontend for the loopback-only dashboard."""
import datetime as dt
import http.client
import ipaddress
import json
import ssl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

ROOT=Path(__file__).resolve().parents[1]

def certificates(address):
    folder=ROOT/'data/dashboard-tls';folder.mkdir(parents=True,exist_ok=True)
    cert,key=folder/'server.pem',folder/'server-key.pem'
    if cert.exists() and key.exists():
        existing=x509.load_pem_x509_certificate(cert.read_bytes())
        if existing.not_valid_after_utc>dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=7) and ipaddress.ip_address(address) in existing.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.IPAddress):return cert,key
    now=dt.datetime.now(dt.timezone.utc)
    ca_key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    ca_name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Minecraft AI Lab Local CA')])
    ca=(x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name).public_key(ca_key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-dt.timedelta(minutes=5)).not_valid_after(now+dt.timedelta(days=730)).add_extension(x509.BasicConstraints(ca=True,path_length=0),critical=True).add_extension(x509.KeyUsage(digital_signature=True,content_commitment=False,key_encipherment=False,data_encipherment=False,key_agreement=False,key_cert_sign=True,crl_sign=True,encipher_only=False,decipher_only=False),critical=True).sign(ca_key,hashes.SHA256()))
    server_key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    leaf=(x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,address)])).issuer_name(ca_name).public_key(server_key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-dt.timedelta(minutes=5)).not_valid_after(now+dt.timedelta(days=365)).add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address(address))]),critical=False).add_extension(x509.BasicConstraints(ca=False,path_length=None),critical=True).add_extension(x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.SERVER_AUTH]),critical=False).sign(ca_key,hashes.SHA256()))
    key.write_bytes(server_key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    cert.write_bytes(leaf.public_bytes(serialization.Encoding.PEM)+ca.public_bytes(serialization.Encoding.PEM))
    (folder/'ca.pem').write_bytes(ca.public_bytes(serialization.Encoding.PEM))
    (ROOT/'docs/dashboard-lan-ca.cer').write_bytes(ca.public_bytes(serialization.Encoding.DER))
    # The CA signing key is discarded; only the scoped server key remains locally.
    return cert,key

class DashboardProxy(BaseHTTPRequestHandler):
    protocol_version='HTTP/1.0'
    def do_GET(self):self.proxy()
    def do_POST(self):self.proxy()
    def do_HEAD(self):self.proxy()
    def proxy(self):
        if ipaddress.ip_address(self.client_address[0]) not in self.server.subnet:
            self.send_error(403,'LAN clients only');return
        if self.headers.get('Host') not in (self.server.authority,self.server.address):
            self.send_error(403,'Invalid host');return
        origin=self.headers.get('Origin')
        if origin is not None and origin!='https://'+self.server.authority:
            self.send_error(403,'Invalid origin');return
        if not self.path.startswith('/') or self.path.startswith('//') or self.headers.get('Transfer-Encoding'):
            self.send_error(400);return
        try:length=int(self.headers.get('Content-Length','0'))
        except ValueError:self.send_error(400);return
        if not 0<=length<=1024*1024:self.send_error(413);return
        self.connection.settimeout(130)
        body=self.rfile.read(length) if length else None
        headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','origin','connection','transfer-encoding','content-length','forwarded','x-forwarded-for','x-forwarded-proto')}
        headers['Host']='127.0.0.1:8000'
        if origin:headers['Origin']='http://127.0.0.1:8000'
        upstream=http.client.HTTPConnection('127.0.0.1',8000,timeout=125)
        try:
            upstream.request(self.command,self.path,body=body,headers=headers)
            response=upstream.getresponse();payload=response.read()
            self.send_response(response.status)
            for k,v in response.getheaders():
                if k.lower() not in ('connection','transfer-encoding','content-length','server','date'):
                    if k.lower()=='set-cookie':v+='; Secure'
                    self.send_header(k,v)
            self.send_header('Content-Length',str(len(payload)));self.end_headers()
            if self.command!='HEAD':self.wfile.write(payload)
        except (OSError,http.client.HTTPException):self.send_error(502,'Local lab unavailable')
        finally:upstream.close()
    def log_message(self,*args):pass

def main():
    config=json.loads((ROOT/'config/lan.json').read_text(encoding='utf-8'))
    if not config.get('dashboard_https',False):return
    address=config['address'];subnet=ipaddress.ip_network(config['subnet'])
    if not ipaddress.ip_address(address).is_private or ipaddress.ip_address(address) not in subnet:raise ValueError('Expected a private LAN address in the allowed subnet')
    cert,key=certificates(address)
    server=ThreadingHTTPServer((address,8000),DashboardProxy);server.address=address;server.authority=address+':8000';server.subnet=subnet;server.daemon_threads=True
    context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.minimum_version=ssl.TLSVersion.TLSv1_2;context.load_cert_chain(cert,key)
    server.socket=context.wrap_socket(server.socket,server_side=True)
    server.serve_forever()

if __name__=='__main__':main()
