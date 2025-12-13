const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');

const app = express();

// Optionally create an HTTPS server when SSL cert/key paths are provided via
// environment variables `SSL_CERT_PATH` and `SSL_KEY_PATH`. This allows other
// devices on the LAN to access getUserMedia which requires a secure origin
// in many browsers.
let server;
if (process.env.SSL_CERT_PATH && process.env.SSL_KEY_PATH) {
  try {
    const cert = fs.readFileSync(process.env.SSL_CERT_PATH);
    const key = fs.readFileSync(process.env.SSL_KEY_PATH);
    server = https.createServer({ key, cert }, app);
    console.log('Starting HTTPS server using provided cert/key');
  } catch (err) {
    console.error('Failed to read SSL cert/key, falling back to HTTP', err);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', socket => {
  console.log('socket connected', socket.id);

  socket.on('create or join', room => {
    const clients = io.sockets.adapter.rooms.get(room);
    const numClients = clients ? clients.size : 0;
    console.log(`Room ${room} has ${numClients} client(s)`);
    if (numClients === 0) {
      socket.join(room);
      socket.emit('created', room);
      console.log(`Socket ${socket.id} created room ${room}`);
    } else if (numClients === 1) {
      socket.join(room);
      io.to(room).emit('join', room);
      socket.emit('joined', room);
      console.log(`Socket ${socket.id} joined room ${room}`);
    } else {
      socket.emit('full', room);
    }
  });

  socket.on('message', ({ room, type, data }) => {
    console.log(`Signal message from ${socket.id} in room ${room}: ${type}`);
    // forward messages to other peers in the same room
    socket.to(room).emit('message', { type, data });
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Attempt to listen, and if the port is in use, try the next port up to +10
const maxAttempts = 10;
let attempts = 0;
let currentPort = PORT;

function printListenInfo(port) {
  const httpsModule = require('https');
  const protocol = server instanceof httpsModule.Server ? 'https' : 'http';
  const os = require('os');
  const ifaces = os.networkInterfaces();
  let lanIp = 'localhost';
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        lanIp = iface.address;
        break;
      }
    }
    if (lanIp !== 'localhost') break;
  }
  console.log(`Server listening on ${protocol}://localhost:${port}`);
  console.log(`Accessible on your LAN at ${protocol}://${lanIp}:${port}`);
}

function tryListen(port) {
  attempts += 1;
  currentPort = port;
  server.once('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use.`);
      if (attempts <= maxAttempts) {
        const next = port + 1;
        console.log(`Trying port ${next} instead...`);
        tryListen(next);
      } else {
        console.error(`All ports ${PORT}..${PORT + maxAttempts} are in use. Exiting.`);
        process.exit(1);
      }
    } else {
      console.error('Server error', err);
      process.exit(1);
    }
  });

  server.listen(port, HOST, () => {
    printListenInfo(port);
  });
}

tryListen(currentPort);
