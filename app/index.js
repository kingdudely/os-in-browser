// remote-desktop-host/index.js
const http = require('http');
const { WebSocketServer } = require('ws');
const ServerPeer = require('./ServerPeer.js');

const wss = new WebSocketServer({ noServer: true });
wss.on('connection', (ws) => {
	new ServerPeer(ws);
});

export default class Host extends http.Server {
	constructor({
		verifyCredential = (credential) => true
	} = {}) {
		super();
		this.verifyCredential = verifyCredential;
		this.on("upgrade", this.#handleUpgrade);
	}

	async #handleUpgrade(request, socket, head) {
		const protocols = (request.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim()).filter(Boolean);
		const credential = protocols[0];

		let ok = true;
		try {
			ok = await this.verifyCredential(credential);
		} catch (err) {
			console.error('authorize() threw:', err);
			ok = false;
		}

		if (!ok) {
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
			socket.destroy();
			return;
		}

		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit('connection', ws, request);
		});
	}
}