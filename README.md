# VoIP Demo (1-1 WebRTC)

This is a minimal 1‑on‑1 WebRTC demo using a small Node.js signaling server (Socket.IO).

Quick start

1. Install dependencies
```bash
cd /Users/elena/Desktop/CryptoMark
npm install
```
2. Start server
```bash
npm start
```
3. Open two browser tabs (or two devices) and visit `http://localhost:3000`.
4. In one tab, enter a room name and click "Create room". In the other tab, enter the same room name and click "Join room".
5. Allow camera/microphone when prompted. You should see local and remote video.

Notes
- Uses public Google STUN server: `stun:stun.l.google.com:19302`.
- For more reliable connectivity across restrictive NATs, add a TURN server.
- For production, serve over HTTPS/WSS and add authentication.

LAN / two-device testing (options)

- Option A — Expose local server via `ngrok` (quick, secure):
	1. Install `ngrok` (https://ngrok.com/) and authenticate.
	2. Run the app locally: `npm start`.
	3. In another terminal run:
	```bash
	ngrok http 3000
	```
	4. Use the generated `https://...ngrok.io` URL on both devices (phone + laptop).

- Option B — Serve locally over HTTPS using `mkcert` (recommended for LAN):
	1. Install `mkcert` and create a local CA (macOS + Homebrew):
	```bash
	brew install mkcert nss
	mkcert -install
	```
	2. Generate certificate and key for your machine's LAN hostnames/IPs (for example `localhost` and your local IP `192.168.x.x`):
	```bash
	mkcert localhost 192.168.1.42
	```
	This creates two files like `localhost+2-key.pem` and `localhost+2.pem`.
	3. Start the server with the cert/key paths (replace filenames):
	```bash
	SSL_CERT_PATH=./localhost+2.pem SSL_KEY_PATH=./localhost+2-key.pem npm run start:https
	```
	4. Find your Mac's LAN IP (`ipconfig getifaddr en0` or `ifconfig`) and open `https://192.168.1.42:3000` on the other device.

- Option C — Port forwarding / public domain: set up router port-forwarding and use a public domain with a valid cert (more setup).

Notes on secure origins
- Browsers require `getUserMedia()` on secure origins (`https://`), except `http://localhost`. When accessing the demo from a different device on the LAN you must serve the page over HTTPS or use a secure tunnel (ngrok) so the remote device can allow camera/mic access.

# CryptoMark

CryptoMark was built during the **Garaža Hackathon (Belgrade, Serbia | 12–14 Dec 2025)**.

As generative audio tools and voice agents become easier to deploy, it’s also becoming easier to copy, remix, and redistribute synthetic content without attribution or control. CryptoMark explores a practical way to add **traceability** to AI-generated audio by combining:

- **Watermarking** for embedding unique IDs into generated audio/agent outputs  
- **Detection & verification** tooling to check whether a watermark is present and recover its ID  
- **Blockchain anchoring** to make watermark IDs tamper-evident and auditable (proving when an ID existed and who registered it)

The goal is to provide an integration-friendly layer for audio GenAI companies and developers: watermark at generation time, detect downstream, and optionally verify provenance through an on-chain record.

> Status: Hackathon prototype — APIs, architecture, and security assumptions are evolving.

