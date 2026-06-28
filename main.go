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
	"time"

	"github.com/quic-go/quic-go"
	"github.com/quic-go/quic-go/http3"
	"github.com/quic-go/webtransport-go"
)

const stunServer = "stun.l.google.com:19302"

func getSrflxAddr(conn *net.UDPConn) (string, int, error) {
	stunAddr, err := net.ResolveUDPAddr("udp4", stunServer)
	if err != nil {
		return "", 0, err
	}

	txID := make([]byte, 12)
	rand.Read(txID)
	req := make([]byte, 20)
	binary.BigEndian.PutUint16(req[0:], 0x0001)
	binary.BigEndian.PutUint16(req[2:], 0)
	binary.BigEndian.PutUint32(req[4:], 0x2112A442)
	copy(req[8:], txID)

	if _, err = conn.WriteToUDP(req, stunAddr); err != nil {
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
		if len(data) < 20 || binary.BigEndian.Uint16(data[0:]) != 0x0101 {
			continue
		}
		if string(data[8:20]) != string(req[8:20]) {
			continue
		}
		pos := 20
		for pos+4 <= len(data) {
			attrType := binary.BigEndian.Uint16(data[pos:])
			attrLen := int(binary.BigEndian.Uint16(data[pos+2:]))
			pos += 4
			if pos+attrLen > len(data) {
				break
			}
			val := data[pos : pos+attrLen]
			if (attrType == 0x0020 || attrType == 0x0001) && attrLen >= 8 && val[1] == 0x01 {
				portBytes := binary.BigEndian.Uint16(val[2:4])
				ipBytes := make([]byte, 4)
				copy(ipBytes, val[4:8])
				if attrType == 0x0020 {
					portBytes ^= 0x2112
					for i := range ipBytes {
						ipBytes[i] ^= req[4+i]
					}
				}
				return net.IP(ipBytes).String(), int(portBytes), nil
			}
			pos += (attrLen + 3) &^ 3
		}
	}
}

func generateCert() (tls.Certificate, []byte, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, nil, err
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "os-in-browser"},
		NotBefore:    time.Now().Add(-time.Minute),
		// Must be < 14 days for serverCertificateHashes
		NotAfter: time.Now().Add(13 * 24 * time.Hour),
	}
	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		return tls.Certificate{}, nil, err
	}
	parsed, err := x509.ParseCertificate(certDER)
	if err != nil {
		return tls.Certificate{}, nil, err
	}
	fp := sha256.Sum256(parsed.Raw)
	return tls.Certificate{Certificate: [][]byte{certDER}, PrivateKey: key}, fp[:], nil
}

func sendKeepalives(conn *net.UDPConn) {
	stunAddr, _ := net.ResolveUDPAddr("udp4", stunServer)
	req := make([]byte, 20)
	binary.BigEndian.PutUint16(req[0:], 0x0001)
	binary.BigEndian.PutUint32(req[4:], 0x2112A442)
	for range time.Tick(25 * time.Second) {
		rand.Read(req[8:])
		conn.WriteToUDP(req, stunAddr)
	}
}

func main() {
	conn, err := net.ListenUDP("udp4", &net.UDPAddr{Port: 0})
	if err != nil {
		log.Fatal("bind:", err)
	}

	log.Println("Discovering public address via STUN...")
	ip, port, err := getSrflxAddr(conn)
	if err != nil {
		log.Fatal("STUN:", err)
	}

	tlsCert, fp, err := generateCert()
	if err != nil {
		log.Fatal("cert:", err)
	}
	fpHex := hex.EncodeToString(fp)

	log.Println("==============================================")
	log.Printf("https://%s:%d/#%s", ip, port, fpHex)
	log.Println("==============================================")

	go sendKeepalives(conn)

	mux := http.NewServeMux()

	wts := webtransport.Server{
		H3: &http3.Server{
			TLSConfig: &tls.Config{Certificates: []tls.Certificate{tlsCert}},
			QUICConfig: &quic.Config{
				EnableDatagrams:                 true,
				EnableStreamResetPartialDelivery: true,
			},
		},
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	webtransport.ConfigureHTTP3Server(wts.H3)

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, indexHTML, ip, port, fpHex, ip, port)
	})

	mux.HandleFunc("/wt", func(w http.ResponseWriter, r *http.Request) {
		sess, err := wts.Upgrade(w, r)
		if err != nil {
			log.Printf("upgrade: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		go func() {
			stream, err := sess.AcceptStream(r.Context())
			if err != nil {
				log.Printf("AcceptStream: %v", err)
				return
			}
			buf := make([]byte, 4096)
			n, _ := stream.Read(buf)
			log.Printf("Received: %s", buf[:n])
			stream.Write([]byte("hello from runner!"))
		}()
	})

	wts.H3.Handler = mux

	tr := &quic.Transport{Conn: conn}
	tlsConf := http3.ConfigureTLSConfig(&tls.Config{Certificates: []tls.Certificate{tlsCert}})
	ln, err := tr.ListenEarly(tlsConf, &quic.Config{
		EnableDatagrams:                 true,
		EnableStreamResetPartialDelivery: true,
	})
	if err != nil {
		log.Fatal("listen:", err)
	}

	log.Printf("Serving on %s:%d", ip, port)
	if err := wts.H3.ServeListener(ln); err != nil {
		log.Fatal("serve:", err)
	}
}

const indexHTML = `<!DOCTYPE html>
<html>
<head>
  <title>os-in-browser</title>
  <style>body{font-family:monospace;padding:2em}#log{white-space:pre;border:1px solid #ccc;padding:1em;height:300px;overflow:auto}</style>
</head>
<body>
<h2>os-in-browser</h2>
<div id="log"></div>
<script>
const log = s => {
  const el = document.getElementById('log');
  el.textContent += s + '\n';
  el.scrollTop = el.scrollHeight;
};

const fpHex = location.hash.slice(1) || %q;
const fp = Uint8Array.fromHex(fpHex);

(async () => {
  try {
    log('Connecting...');
    const wt = new WebTransport('https://%s:%d/wt', {
      serverCertificateHashes: [{ algorithm: 'sha-256', value: fp.buffer }]
    });
    await wt.ready;
    log('Connected!');

    const stream = await wt.createBidirectionalStream();
    const writer = stream.writable.getWriter();
    await writer.write(new TextEncoder().encode('hello from browser'));
    log('Sent: hello from browser');

    const reader = stream.readable.getReader();
    const { value } = await reader.read();
    log('Received: ' + new TextDecoder().decode(value));
  } catch(e) {
    log('Error: ' + e);
  }
})();
</script>
</body>
</html>
`