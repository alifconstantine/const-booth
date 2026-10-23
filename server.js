import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import os from 'os';

function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address });
      }
    }
  }
  return addresses;
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  // Map of boothId -> Map<socketId, { ws, isInitiator, clientId }>
  const rooms = new Map();

  const upgradeHandler = typeof app.getUpgradeHandler === 'function' ? app.getUpgradeHandler() : null;

  server.on('upgrade', (req, socket, head) => {
    const { pathname, query } = parse(req.url, true);
    if (pathname === '/api/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, query);
      });
    } else if (upgradeHandler) {
      upgradeHandler(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req, query) => { console.log('[WS SERVER CONNECT]', query);
    let currentBoothId = (query && query.booth ? String(query.booth).toLowerCase().trim() : null);
    const clientId = (query && query.clientId ? String(query.clientId) : '') || Math.random().toString(36).substring(2, 10);
    const socketId = 's_' + Math.random().toString(36).substring(2, 10);

    const send = (type, data) => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type, data: data || {} }));
      }
    };

    // 1. Initial connection response
    send('connected', { socketId });

    const joinRoom = (boothId) => {
      if (!boothId) return;
      currentBoothId = boothId.toLowerCase().trim();

      if (!rooms.has(currentBoothId)) {
        rooms.set(currentBoothId, new Map());
      }

      const room = rooms.get(currentBoothId);

      // If already in this room with active socket, do not re-add or close
      if (room.has(socketId)) {
        return;
      }

      // Clean up any stale socket with the SAME clientId from previous connection
      for (const [existingSocketId, peer] of room.entries()) {
        if (existingSocketId !== socketId && peer.clientId === clientId) {
          try { peer.ws.close(); } catch (_e) {}
          room.delete(existingSocketId);
        }
      }

      // Check if room is full (max 2 participants for photobooth berdua)
      if (room.size >= 2) {
        send('booth-full', { boothId: currentBoothId });
        return;
      }

      const isInitiator = room.size === 0;
      const existingPeerIds = Array.from(room.keys());

      room.set(socketId, { ws, isInitiator, clientId });

      // Tell joining user they've joined
      send('booth-joined', {
        isInitiator,
        peers: existingPeerIds
      });

      // Notify existing peers
      for (const [peerId, peer] of room.entries()) {
        if (peerId !== socketId && peer.ws.readyState === 1) {
          peer.ws.send(JSON.stringify({
            type: 'peer-joined',
            data: { peerId: socketId }
          }));
        }
      }
    };

    // If booth was in query param, join immediately
    if (currentBoothId) {
      joinRoom(currentBoothId);
    }

    ws.on('message', (message) => {
      let msg;
      try {
        msg = JSON.parse(message.toString());
      } catch (_e) {
        return;
      }

      const { type, data } = msg || {};
      if (!type) return;

      if (type === 'join-booth') {
        const bId = (data && data.boothId) || currentBoothId;
        joinRoom(bId);
        return;
      }

      if (type === 'time-sync-ping') {
        send('time-sync-result', {
          t1: (data && data.t1) || Date.now(),
          t2: Date.now(),
          t3: Date.now()
        });
        return;
      }

      if (!currentBoothId || !rooms.has(currentBoothId)) return;
      const room = rooms.get(currentBoothId);

      if (type === 'signal') {
        // Forward WebRTC signal to target peer or other peer
        const targetId = data && data.to;
        const signalData = data && data.signal;

        if (targetId && room.has(targetId)) {
          const targetPeer = room.get(targetId);
          if (targetPeer && targetPeer.ws.readyState === 1) {
            targetPeer.ws.send(JSON.stringify({
              type: 'signal',
              data: {
                from: socketId,
                signal: signalData
              }
            }));
          }
        } else {
          // Broadcast to all other peers in room
          for (const [peerId, peer] of room.entries()) {
            if (peerId !== socketId && peer.ws.readyState === 1) {
              peer.ws.send(JSON.stringify({
                type: 'signal',
                data: {
                  from: socketId,
                  signal: signalData
                }
              }));
            }
          }
        }
        return;
      }

      if (type === 'capture-triggered') {
        const photoCount = (data && Number.isFinite(data.photoCount) && data.photoCount >= 1 && data.photoCount <= 8)
          ? Math.floor(data.photoCount)
          : (room.photoCount || 3);

        const startAt = Date.now() + 500;
        const intervalMs = 4000; // 3s countdown + 1s capture/flash
        const shutterTimes = [];
        for (let i = 0; i < photoCount; i++) {
          shutterTimes.push(startAt + 3500 + (i * intervalMs));
        }
        const revealAt = shutterTimes[shutterTimes.length - 1] + 2500;

        for (const peer of room.values()) {
          if (peer.ws.readyState === 1) {
            peer.ws.send(JSON.stringify({
              type: 'start-capture',
              data: {
                startAt,
                shutterTimes,
                revealAt,
                photoCount
              }
            }));
          }
        }
        return;
      }

      // Broadcast relay events
      const broadcastEvents = {
        'retake': 'on-retake',
        'retake-triggered': 'on-retake',
        'style-switch': 'on-style-switch',
        'style-switched': 'on-style-switch',
        'filter-switch': 'on-filter-switch',
        'filter-switched': 'on-filter-switch',
        'zoom-switch': 'on-zoom-switch',
        'zoom-switched': 'on-zoom-switch',
        'template-sync': 'on-template-sync',
        'booth-output': 'booth-output',
        'ic-customizing': 'ic-customizing',
        'retake-peer-stay': 'retake-peer-stay',
        'retake-peer-ready': 'retake-peer-ready'
      };

      if (broadcastEvents[type]) {
        const outType = broadcastEvents[type];
        if (type === 'template-sync' && data && data.template) {
          room.template = data.template;
          if (data.template.slotsCount) {
            room.photoCount = data.template.slotsCount;
          }
        }
        for (const [peerId, peer] of room.entries()) {
          if (peerId !== socketId && peer.ws.readyState === 1) {
            peer.ws.send(JSON.stringify({
              type: outType,
              data: data || {}
            }));
          }
        }
        return;
      }

      if (type === 'leave-booth') {
        leaveCurrentRoom();
      }
    });

    const leaveCurrentRoom = () => {
      if (currentBoothId && rooms.has(currentBoothId)) {
        const room = rooms.get(currentBoothId);
        room.delete(socketId);

        // Notify remaining peer
        for (const peer of room.values()) {
          if (peer.ws.readyState === 1) {
            peer.ws.send(JSON.stringify({
              type: 'peer-left',
              data: { peerId: socketId, reason: 'disconnect' }
            }));
          }
        }

        if (room.size === 0) {
          rooms.delete(currentBoothId);
        }
      }
    };

    ws.on('close', (code, reason) => { console.log('[WS SERVER CLOSE]', socketId, code, reason ? reason.toString() : ''); leaveCurrentRoom(); });
    ws.on('error', (err) => { console.error('[WS SERVER ERROR]', socketId, err); leaveCurrentRoom(); });
  });

  server.listen(port, hostname, () => {
    const netList = getNetworkAddresses();
    console.log('\n' + '='.repeat(60));
    console.log('📸 ConstBooth Server Siap Digunakan!');
    console.log(`- Local (Laptop)  : http://localhost:${port}`);
    if (netList.length > 0) {
      netList.forEach(n => {
        console.log(`- Network (HP/LAN): http://${n.address}:${port} (${n.name})`);
      });
    } else {
      console.log(`- Network (HP/LAN): http://<IP_LAPTOP>:${port}`);
    }
    console.log('\n📱 Untuk Photobooth Berdua / Akses dari HP:');
    console.log('1. Hubungkan HP ke Wi-Fi / Hotspot yang sama dengan laptop.');
    console.log('2. Buka URL Network di atas pada browser HP.');
    console.log('3. Ingin kamera HP langsung aktif via HTTPS gratis tanpa repot?');
    console.log('   Jalankan perintah: npm run share');
    console.log('='.repeat(60) + '\n');
  });
});
