# host.py
import json, sys, struct, subprocess

def read_message():
    length = struct.unpack('<I', sys.stdin.buffer.read(4))[0]
    return json.loads(sys.stdin.buffer.read(length))

def send_message(msg):
    data = json.dumps(msg).encode()
    sys.stdout.buffer.write(struct.pack('<I', len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()

while True:
    msg = read_message()
    result = subprocess.run(msg['cmd'], shell=True, capture_output=True, text=True)
    send_message({ 'stdout': result.stdout, 'stderr': result.stderr })