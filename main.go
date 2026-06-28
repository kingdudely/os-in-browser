package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/quic-go/quic-go"
	"github.com/quic-go/quic-go/http3"
)

const stunServer = "stun.l.google.com:19302"

// getSrflxAddr performs a minimal STUN binding request on conn
// and returns the public IP:port from the XOR-MAPPED-ADDRESS attribute.
func getSrflxAddr(conn *net.UDPConn) (string, int, error) {
	stunAddr, err := net.ResolveUDPAddr("udp4", stunServer)
	if err != nil {
		return "", 0, err
	}

	// STUN binding request: 20-byte header
	// type=0x0001, length=0, magic=0x2112A442, transaction ID (12 random bytes)
	txID := make([]byte, 12)
	rand.Read(txID)
	req := make([]byte, 20)
	binary.BigEndian.PutUint16(req[0:], 0x0001)  // Binding Request
	binary.BigEndian.PutUint16(req[2:], 0)        // length
	binary.BigEndian.PutUint32(req[4:], 0x2112A442) // magic cookie
	copy(req[8:], txID)

	_, err = conn.WriteToUDP(req, stunAddr)
	if err != nil {
		return "", 0, err
	}

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	defer conn.SetReadDeadline(time.Time{})

	buf := make([]byte, 1024)
	for {
		n, _, err := conn.ReadFromUDP(buf)
		if err != nil {
			return "", 0, fmt.Errorf("STUN read: %w", err)
		}
		data := buf[:n]
		if len(data) < 20 {
			continue
		}
		// Check it's a binding success response (0x0101) with our txID
		if binary.BigEndian.Uint16(data[0:]) != 0x0101 {
			continue
		}
		if string(data[8:20]) != string(req[8:20]) {
			continue
		}

		// Parse attributes
		pos := 20
		for pos+4 <= len(data) {
			attrType := binary.BigEndian.Uint16(data[pos:])
			attrLen := int(binary.BigEndian.Uint16(data[pos+2:]))
			pos += 4
			if pos+attrLen > len(data) {
				break
			}
			val := data[pos : pos+attrLen]

			// XOR-MAPPED-ADDRESS = 0x0020, MAPPED-ADDRESS = 0x0001
			if (attrType == 0x0020 || attrType == 0x0001) && attrLen >= 8 {
				// val[0] = reserved, val[1] = family (1=IPv4)
				if val[1] == 0x01 {
					portBytes := binary.BigEndian.Uint16(val[2:4])
					ipBytes := val[4:8]
					if attrType == 0x0020 {
						// XOR with magic cookie
						portBytes ^= 0x2112
						for i := range ipBytes {
							ipBytes[i] ^= req[4+i]
						}
					}
					ip := net.IP(ipBytes).String()
					return ip, int(portBytes), nil
				}
			}
			// attributes are padded to 4-byte boundaries
			padded := (attrLen + 3) &^ 3
			pos += padded
		}
	}
}

func generateSelfSignedCert() (tls.Certificate, []byte, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, nil, err
	}

	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "os-in-browser"},
		NotBefore:    time.Now().Add(-time.Minute),
		NotAfter:     time.Now().Add(7 * 24 * time.Hour),
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		return tls.Certificate{}, nil, err
	}

	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return tls.Certificate{}, nil, err
	}

	fingerprint := sha256.Sum256(cert.Raw)

	tlsCert := tls.Certificate{
		Certificate: [][]byte{certDER},
		PrivateKey:  key,
	}

	return tlsCert, fingerprint[:], nil
}

func sendStunKeepalive(conn *net.UDPConn) {
	stunAddr, _ := net.ResolveUDPAddr("udp4", stunServer)
	txID := make([]byte, 12)
	req := make([]byte, 20)
	binary.BigEndian.PutUint16(req[0:], 0x0001)
	binary.BigEndian.PutUint32(req[4:], 0x2112A442)

	ticker := time.NewTicker(25 * time.Second)
	for range ticker.C {
		rand.Read(txID)
		copy(req[8:], txID)
		conn.WriteToUDP(req, stunAddr)
	}
}

func main() {
	// 1. Bind UDP socket on ephemeral port
	conn, err := net.ListenUDP("udp4", &net.UDPAddr{Port: 0})
	if err != nil {
		log.Fatal("bind UDP:", err)
	}

	// 2. STUN → discover public IP:port
	log.Println("Discovering public address via STUN...")
	ip, port, err := getSrflxAddr(conn)
	if err != nil {
		log.Fatal("STUN:", err)
	}
	log.Printf("Public address: %s:%d", ip, port)

	// 3. Generate self-signed cert, compute fingerprint
	tlsCert, fingerprintBytes, err := generateSelfSignedCert()
	if err != nil {
		log.Fatal("cert:", err)
	}
	fingerprintHex := hex.EncodeToString(fingerprintBytes)

	// 4. Build the URL the user clicks
	// Fragment encodes cert hash so the browser JS can read location.hash
	url := fmt.Sprintf("https://%s:%d/#%s", ip, port, fingerprintHex)
	log.Println("==============================================")
	log.Println("OPEN THIS URL IN CHROME:")
	log.Println(url)
	log.Println("==============================================")

	// 5. Start STUN keepalives to hold the NAT mapping open
	go sendStunKeepalive(conn)

	// 6. Set up HTTP/3 server on the same UDP socket
	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprintf(w, indexHTML, ip, port, fingerprintHex)
	})

	mux.HandleFunc("/webtransport", func(w http.ResponseWriter, r *http.Request) {
		// WebTransport upgrade happens here — quic-go handles the CONNECT upgrade
		// For now just confirm it's reachable
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "WebTransport endpoint ready")
	})

	tlsConf := http3.ConfigureTLSConfig(&tls.Config{
		Certificates: []tls.Certificate{tlsCert},
	})

	tr := &quic.Transport{Conn: conn}
	ln, err := tr.ListenEarly(tlsConf, &quic.Config{
		EnableDatagrams: true,
	})
	if err != nil {
		log.Fatal("QUIC listen:", err)
	}

	server := &http3.Server{
		Handler: mux,
		Addr:    fmt.Sprintf("%s:%d", ip, port),
	}

	log.Printf("HTTP/3 server listening on UDP %s:%d", ip, port)
	if err := server.ServeListener(ln); err != nil {
		log.Fatal("serve:", err)
	}
}

// indexHTML is served at / — reads the cert hash from location.hash
// and opens a WebTransport session to itself
const indexHTML = `<!DOCTYPE html>
<html>
<head><title>os-in-browser</title></head>
<body>
<pre id="log"></pre>
<script>
const log = s => document.getElementById('log').textContent += s + '\n';

const fingerprintHex = location.hash.slice(1);
if (!fingerprintHex) { log('No cert hash in URL fragment'); }

const hashBytes = Uint8Array.fromHex(fingerprintHex);

async function connect() {
  const url = 'https://%s:%d/webtransport';
  log('Connecting to ' + url);

  const wt = new WebTransport(url, {
    serverCertificateHashes: [{
      algorithm: 'sha-256',
      value: hashBytes.buffer,
    }]
  });

  await wt.ready;
  log('WebTransport connected!');

  // Open a bidirectional stream
  const stream = await wt.createBidirectionalStream();
  const writer = stream.writable.getWriter();
  await writer.write(new TextEncoder().encode('hello from browser'));
  log('Sent: hello from browser');

  const reader = stream.readable.getReader();
  const { value } = await reader.read();
  log('Received: ' + new TextDecoder().decode(value));
}

connect().catch(e => log('Error: ' + e));
</script>
</body>
</html>
`