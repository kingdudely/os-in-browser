#!/usr/bin/env python3
"""
Minimal STUN client + UDP hole-keepalive.
No external deps -- stdlib only, works on Linux/macOS/Windows runners.

1. Binds one UDP socket on a fixed local port.
2. Sends a STUN Binding Request (RFC 5389) to a public STUN server.
3. Parses XOR-MAPPED-ADDRESS from the response -> your public ip:port.
4. Loops sending a keepalive on that same socket so the NAT mapping
   doesn't expire, for a configurable duration.

Usage:
    python3 stun_open_port.py --port 45000 --duration 3300
"""
import argparse
import socket
import struct
import time
import sys
import random

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
    # header: type(2) + length(2) + magic cookie(4) + transaction id(12)
    header = struct.pack("!HHI12s", STUN_BINDING_REQUEST, 0, STUN_MAGIC_COOKIE, txn_id)
    return header


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
            if family == 0x01:  # IPv4
                xaddr_bytes = bytearray(attr_val[4:8])
                cookie_bytes = struct.pack("!I", STUN_MAGIC_COOKIE)
                ip_bytes = bytes(b ^ c for b, c in zip(xaddr_bytes, cookie_bytes))
                ip = socket.inet_ntoa(ip_bytes)
                return ip, xport

        if attr_type == ATTR_MAPPED_ADDRESS and len(attr_val) >= 8:
            family = attr_val[1]
            port = struct.unpack("!H", attr_val[2:4])[0]
            if family == 0x01:
                ip = socket.inet_ntoa(attr_val[4:8])
                return ip, port

        # attrs are padded to 4-byte boundary
        padded_len = (attr_len + 3) & ~3
        offset += 4 + padded_len

    return None


def stun_discover(sock: socket.socket, timeout: float = 3.0):
    last_err = None
    for host, port in STUN_SERVERS:
        try:
            txn_id = bytes(random.getrandbits(8) for _ in range(12))
            req = build_binding_request(txn_id)
            sock.settimeout(timeout)
            sock.sendto(req, (host, port))
            data, _ = sock.recvfrom(2048)
            result = parse_binding_response(data, txn_id)
            if result:
                return result
        except (socket.timeout, OSError) as e:
            last_err = e
            continue
    raise RuntimeError(f"STUN discovery failed against all servers: {last_err}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=45000, help="local UDP port to bind")
    ap.add_argument("--duration", type=int, default=3300, help="seconds to keep port alive")
    ap.add_argument("--keepalive-interval", type=int, default=15, help="seconds between keepalives")
    args = ap.parse_args()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", args.port))

    print(f"[+] Bound local UDP socket on 0.0.0.0:{args.port}", flush=True)

    try:
        ext_ip, ext_port = stun_discover(sock)
    except RuntimeError as e:
        print(f"[!] {e}", file=sys.stderr, flush=True)
        sys.exit(1)

    print("=" * 60, flush=True)
    print(f"PUBLIC_ENDPOINT={ext_ip}:{ext_port}", flush=True)
    print("=" * 60, flush=True)
    print(f"[+] Hand this socket (local port {args.port}) to your", flush=True)
    print(f"    WebTransport/QUIC listener. Keeping the NAT mapping", flush=True)
    print(f"    alive for up to {args.duration}s with keepalives every", flush=True)
    print(f"    {args.keepalive_interval}s.", flush=True)

    # keep the mapping alive; re-verify occasionally in case the
    # external port drifted (symmetric NAT would show this)
    start = time.time()
    last_check = start
    while time.time() - start < args.duration:
        try:
            # bare keepalive: repeat a STUN request, doubles as "is mapping stable" check
            ip, port = stun_discover(sock, timeout=2.0)
            if (ip, port) != (ext_ip, ext_port):
                print(f"[!] WARNING: external mapping changed to {ip}:{port} "
                      f"(was {ext_ip}:{ext_port}) -- NAT may be symmetric or "
                      f"mapping was re-allocated", flush=True)
                ext_ip, ext_port = ip, port
        except RuntimeError as e:
            print(f"[!] keepalive STUN check failed: {e}", flush=True)

        time.sleep(args.keepalive_interval)

    print("[+] Duration elapsed, exiting.", flush=True)


if __name__ == "__main__":
    main()