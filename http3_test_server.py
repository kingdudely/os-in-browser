#!/usr/bin/env python3
"""
STUN discovery + minimal HTTP/3 server, for testing whether a GitHub
Actions runner's NAT actually lets an external client connect over UDP.

Flow:
  1. Bind local UDP port, do STUN discovery, print PUBLIC_ENDPOINT + cert hash.
  2. Close the discovery socket, immediately rebind the SAME local port
     with the HTTP/3 (QUIC) server -- cone NATs key mappings by local
     port, so this should preserve the mapping across the handoff.
  3. Serve a trivial "it works" response on any path.

Test from a machine with curl built against a QUIC-capable libcurl:
    curl --http3-only -k https://<PUBLIC_ENDPOINT>/

Test from a browser devtools console (self-signed cert needs pinning
via serverCertificateHashes, same mechanism WebTransport uses,
since fetch() itself can't just ignore cert errors like curl -k can):
    fetch("https://<PUBLIC_ENDPOINT>/")  // will fail on untrusted cert
    // easiest real test is curl --http3-only -k, or a real CA cert
"""
import argparse
import asyncio
import base64
import datetime
import socket
import struct
import random

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
            print(f"[+] HTTP/3 request for {path!r} from stream {event.stream_id}", flush=True)
            body = b"it works! served over http/3 (udp) from the github runner.\n"
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
            print("[+] responded 200 OK", flush=True)


async def run_server(local_port: int, duration: int):
    print("[+] Starting STUN discovery...", flush=True)
    ext_ip, ext_port = stun_discover(local_port)

    cert_hash = gen_cert()
    cert_hash_b64 = base64.b64encode(cert_hash).decode()

    print("=" * 60, flush=True)
    print(f"PUBLIC_ENDPOINT={ext_ip}:{ext_port}", flush=True)
    print(f"CERT_HASH_B64={cert_hash_b64}", flush=True)
    print("=" * 60, flush=True)
    print(f"[+] Test with: curl --http3-only -k https://{ext_ip}:{ext_port}/", flush=True)
    print("[+] Rebinding same local port for HTTP/3 server...", flush=True)

    configuration = QuicConfiguration(
        alpn_protocols=["h3"],
        is_client=False,
    )
    configuration.load_cert_chain("cert.pem", "key.pem")

    server = await serve(
        "0.0.0.0",
        local_port,
        configuration=configuration,
        create_protocol=Http3TestProtocol,
    )
    print(f"[+] HTTP/3 server listening on local port {local_port}", flush=True)

    await asyncio.sleep(duration)
    print("[+] Duration elapsed, shutting down.", flush=True)
    server.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=45000)
    ap.add_argument("--duration", type=int, default=1800)
    args = ap.parse_args()
    asyncio.run(run_server(args.port, args.duration))


if __name__ == "__main__":
    main()