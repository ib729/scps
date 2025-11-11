/**
 * Custom Next.js Server with WebSocket Support
 * 
 * This custom server adds WebSocket support for NFC tap events
 * while maintaining all Next.js functionality.
 */

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Import tap broadcaster (will be loaded after Next.js prepares)
let tapBroadcaster;

app.prepare().then(() => {
  // Dynamically import the tap broadcaster after Next.js is ready
  tapBroadcaster = require('./lib/tap-events-node').default;
  
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

  // Create WebSocket server
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrade
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url);

    if (pathname === '/api/nfc/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // WebSocket connection handler
  wss.on('connection', (ws, request) => {
    handleWebSocketConnection(ws, request);
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server ready on ws://${hostname}:${port}/api/nfc/ws`);
  });
});

/**
 * Handle WebSocket connection lifecycle
 */
function handleWebSocketConnection(ws, request) {
  let connectionInfo = null;
  let authenticated = false;
  let pingInterval = null;
  let tapUnsubscribe = null;

  const url = new URL(request.url, `http://${request.headers.host}`);
  const lane = url.searchParams.get('lane') || 'default';

  console.log('[WS] New connection attempt');

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Handle authentication
      if (message.type === 'auth') {
        await handleAuthentication(ws, message, lane);
        return;
      }

      // Only process other messages if authenticated
      if (!authenticated) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Not authenticated'
        }));
        return;
      }

      // Handle tap events from broadcaster
      if (connectionInfo?.role === 'broadcaster' && message.type === 'tap') {
        handleTapEvent(message);
      }

      // Handle pong
      if (message.type === 'pong') {
        // Connection is alive
      }

    } catch (error) {
      console.error('[WS] Message parse error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  // Handle authentication
  async function handleAuthentication(ws, message, lane) {
    const role = message.role;

    if (role === 'broadcaster') {
      // Authenticate Python broadcaster with shared secret
      const expectedSecret = process.env.NFC_TAP_SECRET;
      
      if (!expectedSecret) {
        console.warn('[WS] NFC_TAP_SECRET not configured - allowing broadcaster');
      } else if (message.secret !== expectedSecret) {
        console.warn('[WS] Broadcaster authentication failed');
        ws.send(JSON.stringify({
          type: 'auth_failed',
          message: 'Invalid secret'
        }));
        ws.close(1008, 'Authentication failed');
        return;
      }

      connectionInfo = {
        role: 'broadcaster',
        lane: message.lane || lane,
      };

      authenticated = true;

      console.log(`[WS] Broadcaster authenticated (lane: ${connectionInfo.lane})`);

      ws.send(JSON.stringify({
        type: 'auth_success',
        role: 'broadcaster',
        lane: connectionInfo.lane
      }));

      // Start ping interval
      startPingInterval();

    } else if (role === 'client') {
      // For browser clients, we can't easily verify session here
      // So we'll allow the connection and rely on the Next.js app
      // to handle authentication at the application level
      
      connectionInfo = {
        role: 'client',
        lane: lane,
      };

      authenticated = true;

      console.log(`[WS] Client authenticated (lane: ${lane})`);

      ws.send(JSON.stringify({
        type: 'auth_success',
        role: 'client',
        lane: lane
      }));

      // Subscribe to tap events
      tapUnsubscribe = tapBroadcaster.subscribe((event) => {
        // Filter by lane if needed
        if (event.lane && event.lane !== lane && lane !== 'default') {
          return;
        }

        // Send tap to client
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(event));
        }
      });

      // Start ping interval
      startPingInterval();

    } else {
      ws.send(JSON.stringify({
        type: 'auth_failed',
        message: 'Invalid role'
      }));
      ws.close(1008, 'Invalid role');
    }
  }

  // Handle tap events from broadcaster
  function handleTapEvent(message) {
    if (!message.card_uid) {
      console.warn('[WS] Tap event missing card_uid');
      return;
    }

    const tapEvent = {
      card_uid: message.card_uid,
      lane: message.lane || connectionInfo?.lane || 'default',
      reader_ts: message.reader_ts,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to all clients via tap broadcaster
    const broadcasted = tapBroadcaster.broadcast(tapEvent);

    if (broadcasted) {
      console.log(`[WS] Tap received and broadcast: ${tapEvent.card_uid} (lane: ${tapEvent.lane})`);
    } else {
      console.log(`[WS] Tap ignored (duplicate): ${tapEvent.card_uid}`);
    }
  }

  // Start ping/pong interval
  function startPingInterval() {
    pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      } else {
        if (pingInterval) clearInterval(pingInterval);
      }
    }, 30000); // Ping every 30 seconds
  }

  // Handle connection close
  ws.on('close', (code, reason) => {
    console.log(`[WS] Connection closed (code: ${code}, reason: ${reason || 'none'})`);
    
    // Cleanup
    if (pingInterval) {
      clearInterval(pingInterval);
    }
    
    if (tapUnsubscribe) {
      tapUnsubscribe();
    }
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('[WS] Socket error:', error);
  });
}

