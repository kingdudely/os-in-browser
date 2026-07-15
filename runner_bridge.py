#!/usr/bin/env python3
"""
Runner-side bridge:

  1. STUN-discover this runner's public UDP ip:port.
  2. Start a real HTTP/3 (QUIC) server on that port (self-signed cert).
  3. Start a tiny plain HTTP server on a local TCP port. This is what
     Cloudflare Quick Tunnel will expose -- it has a REAL trusted cert
     (Cloudflare's), so no serverCertificateHashes/cert-warning dance.
     It just answers with JSON telling the browser where the *actual*
     direct HTTP/3 endpoint is, and serves a redirect page for
     convenience.

The Cloudflare tunnel itself is started separately (see workflow) and
just points at this local TCP port -- it never carries the real
traffic, only the signaling.
"""
import argparse
import asyncio
import base64
import datetime
import json
import socket
import struct
import random
from aiohttp import web

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from aioquic.asyncio import serve
from aioquic.h3.connection import H3Connection
from aioquic.h3.events import HeadersReceived, H3Event
from aioquic.quic.configuration import QuicConfiguration
from aioquic.quic.events import QuicEvent, ProtocolNegotiated
from aioquic.asyncio.protocol import QuicConnectionProtocol

STUN_SERVERS = [
    ("stun.l.google.com", 19302),
    ("stun1.l.google.com", 19302),
    ("stun.cloudflare.com", 3478),
]
STUN_MAGIC_COOKIE = 0x2112A442
STUN_BINDING_REQUEST = 0x0001
STUN_BINDING_RESPONSE = 0x0101
ATTR_XOR_MAPPED_ADDRESS = 0x0020
ATTR_MAPPED_ADDRESS = 0x0001


def build_binding_request(txn_id: bytes) -> bytes:
    return struct.pack("!HHI12s", STUN_BINDING_REQUEST, 0, STUN_MAGIC_COOKIE, txn_id)


def parse_binding_response(data: bytes, txn_id: bytes):
    if len(data) < 20:
        return None
    msg_type, msg_len, cookie, resp_txn = struct.unpack("!HHI12s", data[:20])
    if msg_type != STUN_BINDING_RESPONSE or resp_txn != txn_id:
        return None
    body = data[20:20 + msg_len]
    offset = 0
    while offset + 4 <= len(body):
        attr_type, attr_len = struct.unpack("!HH", body[offset:offset + 4])
        attr_val = body[offset + 4:offset + 4 + attr_len]
        if attr_type == ATTR_XOR_MAPPED_ADDRESS and len(attr_val) >= 8:
            family = attr_val[1]
            xport = struct.unpack("!H", attr_val[2:4])[0] ^ (STUN_MAGIC_COOKIE >> 16)
            if family == 0x01:
                xaddr_bytes = bytearray(attr_val[4:8])
                cookie_bytes = struct.pack("!I", STUN_MAGIC_COOKIE)
                ip_bytes = bytes(b ^ c for b, c in zip(xaddr_bytes, cookie_bytes))
                return socket.inet_ntoa(ip_bytes), xport
        if attr_type == ATTR_MAPPED_ADDRESS and len(attr_val) >= 8:
            family = attr_val[1]
            port = struct.unpack("!H", attr_val[2:4])[0]
            if family == 0x01:
                return socket.inet_ntoa(attr_val[4:8]), port
        padded_len = (attr_len + 3) & ~3
        offset += 4 + padded_len
    return None


def stun_discover(local_port: int, timeout: float = 3.0):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", local_port))
    sock.settimeout(timeout)
    try:
        for host, port in STUN_SERVERS:
            try:
                txn_id = bytes(random.getrandbits(8) for _ in range(12))
                sock.sendto(build_binding_request(txn_id), (host, port))
                data, _ = sock.recvfrom(2048)
                result = parse_binding_response(data, txn_id)
                if result:
                    return result
            except (socket.timeout, OSError):
                continue
        raise RuntimeError("STUN discovery failed against all servers")
    finally:
        sock.close()


def gen_cert():
    key = ec.generate_private_key(ec.SECP256R1())
    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, u"os-in-browser-runner")])
    now = datetime.datetime.utcnow()
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject).issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=5))
        .not_valid_after(now + datetime.timedelta(days=13))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName(u"localhost")]), critical=False)
        .sign(key, hashes.SHA256())
    )
    with open("cert.pem", "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    with open("key.pem", "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ))
    digest = hashes.Hash(hashes.SHA256())
    digest.update(cert.public_bytes(serialization.Encoding.DER))
    return digest.finalize()


class Http3TestProtocol(QuicConnectionProtocol):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self._http = None

    def quic_event_received(self, event: QuicEvent):
        if isinstance(event, ProtocolNegotiated):
            self._http = H3Connection(self._quic)
        if self._http is not None:
            for h3_event in self._http.handle_event(event):
                self._h3_event_received(h3_event)

    def _h3_event_received(self, event: H3Event):
        if isinstance(event, HeadersReceived):
            headers = dict(event.headers)
            path = headers.get(b":path", b"/")
            print(f"[quic] request for {path!r}", flush=True)
            body = b"it works! served over http/3 (udp) direct to the runner.\n"
            self._http.send_headers(
                stream_id=event.stream_id,
                headers=[
                    (b":status", b"200"),
                    (b"content-type", b"text/plain"),
                    (b"content-length", str(len(body)).encode()),
                ],
            )
            self._http.send_data(stream_id=event.stream_id, data=body, end_stream=True)
            self.transmit()


async def start_quic_server(local_port: int):
    cert_hash = gen_cert()
    configuration = QuicConfiguration(alpn_protocols=["h3"], is_client=False)
    configuration.load_cert_chain("cert.pem", "key.pem")
    server = await serve(
        "0.0.0.0", local_port,
        configuration=configuration,
        create_protocol=Http3TestProtocol,
    )
    return server, base64.b64encode(cert_hash).decode()


def make_signaling_app(ext_ip: str, ext_port: int, cert_hash_b64: str):
    app = web.Application()

    async def srflx(request):
        return web.json_response({
            "ip": ext_ip,
            "port": ext_port,
            "cert_hash_b64": cert_hash_b64,
            "direct_url": f"https://{ext_ip}:{ext_port}/",
        })

    async def index(request):
        html = f"""<!doctype html>
<html><body>
<h3>Runner signaling</h3>
<p>Direct HTTP/3 endpoint: <code>{ext_ip}:{ext_port}</code></p>
<p>Cert hash (base64): <code>{cert_hash_b64}</code></p>
<p><a href="https://{ext_ip}:{ext_port}/">Click to try direct connect</a>
(self-signed cert -- your browser will warn, click through to test)</p>
<script>
// example of fetching the signaling data programmatically
fetch('/srflx').then(r => r.json()).then(d => console.log('srflx:', d));
</script>
</body></html>"""
        return web.Response(text=html, content_type="text/html")

    app.router.add_get("/", index)
    app.router.add_get("/srflx", srflx)
    return app


async def run(quic_port: int, signaling_port: int, duration: int):
    print("[+] Starting STUN discovery...", flush=True)
    ext_ip, ext_port = stun_discover(quic_port)
    print(f"[+] srflx = {ext_ip}:{ext_port}", flush=True)

    print("[+] Rebinding same local port for HTTP/3 server...", flush=True)
    quic_server, cert_hash_b64 = await start_quic_server(quic_port)

    print("=" * 60, flush=True)
    print(f"PUBLIC_ENDPOINT={ext_ip}:{ext_port}", flush=True)
    print(f"CERT_HASH_B64={cert_hash_b64}", flush=True)
    print("=" * 60, flush=True)

    app = make_signaling_app(ext_ip, ext_port, cert_hash_b64)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", signaling_port)
    await site.start()
    print(f"[+] Local signaling HTTP server on 127.0.0.1:{signaling_port} "
          f"(this is what the Cloudflare tunnel should point at)", flush=True)

    await asyncio.sleep(duration)
    print("[+] Duration elapsed, shutting down.", flush=True)
    quic_server.close()
    await runner.cleanup()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quic-port", type=int, default=45000)
    ap.add_argument("--signaling-port", type=int, default=8080)
    ap.add_argument("--duration", type=int, default=1800)
    args = ap.parse_args()
    asyncio.run(run(args.quic_port, args.signaling_port, args.duration))


if __name__ == "__main__":
    main()