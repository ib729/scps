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
const crypto = require('crypto');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Rate limiting: Track failed auth attempts per IP
const failedAttempts = new Map(); // ip -> { count, firstAttempt, blocked }
const RATE_LIMIT_WINDOW = 60000; // 1 minute window
const MAX_FAILED_ATTEMPTS = 5; // Max attempts per window
const BLOCK_DURATION = 300000; // 5 minutes block

// Connection tracking
let connectionCounter = 0;

/**
 * Get client IP address from request
 */
function getClientIP(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.socket.remoteAddress || 'unknown';
}

/**
 * Mask secret for logging (show first 4 and last 4 chars)
 */
function maskSecret(secret) {
  if (!secret || secret.length < 12) return '[INVALID]';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

/**
 * Check if IP is rate limited
 */
function isRateLimited(ip) {
  const now = Date.now();
  const record = failedAttempts.get(ip);
  
  if (!record) return false;
  
  // Check if block expired
  if (record.blocked && (now - record.blocked < BLOCK_DURATION)) {
    return true;
  }
  
  // Reset if window expired
  if (now - record.firstAttempt > RATE_LIMIT_WINDOW) {
    failedAttempts.delete(ip);
    return false;
  }
  
  return record.count >= MAX_FAILED_ATTEMPTS;
}

/**
 * Record failed authentication attempt
 */
function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = failedAttempts.get(ip);
  
  if (!record || (now - record.firstAttempt > RATE_LIMIT_WINDOW)) {
    failedAttempts.set(ip, { count: 1, firstAttempt: now, blocked: null });
  } else {
    record.count++;
    if (record.count >= MAX_FAILED_ATTEMPTS) {
      record.blocked = now;
      console.warn(`[WS Rate Limit] IP ${ip} blocked for ${BLOCK_DURATION / 1000}s after ${record.count} failed attempts`);
    }
    failedAttempts.set(ip, record);
  }
}

/**
 * Clear failed attempts for IP (on successful auth)
 */
function clearFailedAttempts(ip) {
  failedAttempts.delete(ip);
}

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

  // Connection tracking and metadata
  const connectionId = ++connectionCounter;
  const connectedAt = new Date().toISOString();
  const clientIP = getClientIP(request);
  const userAgent = request.headers['user-agent'] || 'unknown';
  const origin = request.headers['origin'] || request.headers['referer'] || 'unknown';

  const url = new URL(request.url, `http://${request.headers.host}`);
  const lane = url.searchParams.get('lane') || 'default';

  console.log(`[WS #${connectionId}] New connection from ${clientIP}`);
  console.log(`[WS #${connectionId}] User-Agent: ${userAgent}`);
  console.log(`[WS #${connectionId}] Origin: ${origin}`);
  
  // Rate limiting is applied later, only for failed broadcaster authentication
  // Browser clients are not rate limited

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

    console.log(`[WS #${connectionId}] Auth attempt - Role: ${role || 'none'}, IP: ${clientIP}`);

    // Silently reject invalid or missing roles (likely browser noise)
    if (!role || (role !== 'broadcaster' && role !== 'client')) {
      console.warn(`[WS #${connectionId}] Invalid role rejected: ${role}`);
      ws.close(1008, 'Invalid role');
      return;
    }

    if (role === 'broadcaster') {
      // Check rate limiting for broadcaster authentication attempts
      if (isRateLimited(clientIP)) {
        console.warn(`[WS #${connectionId}] Broadcaster auth rejected - IP ${clientIP} is rate limited`);
        ws.send(JSON.stringify({
          type: 'auth_failed',
          message: 'Rate limit exceeded. Too many failed authentication attempts.'
        }));
        ws.close(1008, 'Rate limit exceeded');
        return;
      }
      
      // Authenticate Python broadcaster with shared secret
      const expectedSecret = process.env.NFC_TAP_SECRET;
      const providedSecret = message.secret;
      
      console.log(`[WS #${connectionId}] Broadcaster auth - Expected: ${maskSecret(expectedSecret)}, Provided: ${maskSecret(providedSecret)}`);
      
      if (!expectedSecret) {
        console.warn(`[WS #${connectionId}] NFC_TAP_SECRET not configured - allowing broadcaster (INSECURE!)`);
      } else if (providedSecret !== expectedSecret) {
        // Record failed attempt (only for broadcaster)
        recordFailedAttempt(clientIP);
        
        // Only log details if a secret was actually provided (real attempt, not browser noise)
        if (providedSecret) {
          const record = failedAttempts.get(clientIP);
          console.warn(`[WS #${connectionId}] Broadcaster auth failed - IP: ${clientIP}, Attempts: ${record?.count || 1}/${MAX_FAILED_ATTEMPTS}`);
        } else {
          console.warn(`[WS #${connectionId}] Broadcaster auth failed - no secret provided (browser noise?)`);
        }
        
        ws.send(JSON.stringify({
          type: 'auth_failed',
          message: 'Invalid secret'
        }));
        ws.close(1008, 'Authentication failed');
        return;
      }

      // Clear any failed attempts on successful auth
      clearFailedAttempts(clientIP);

      connectionInfo = {
        role: 'broadcaster',
        lane: message.lane || lane,
        ip: clientIP,
        connectedAt,
      };

      authenticated = true;

      console.log(`[WS #${connectionId}] ✓ Broadcaster authenticated successfully (lane: ${connectionInfo.lane})`);

      ws.send(JSON.stringify({
        type: 'auth_success',
        role: 'broadcaster',
        lane: connectionInfo.lane
      }));

      // Start ping interval
      startPingInterval();

    } else if (role === 'client') {
      // Browser clients are NOT rate limited
      // We trust Next.js app-level authentication for browser clients
      // Rate limiting only applies to broadcaster authentication failures
      
      connectionInfo = {
        role: 'client',
        lane: lane,
        ip: clientIP,
        connectedAt,
        userAgent,
      };

      authenticated = true;

      console.log(`[WS #${connectionId}] ✓ Browser client authenticated (lane: ${lane})`);

      ws.send(JSON.stringify({
        type: 'auth_success',
        role: 'client',
        lane: lane
      }));

      // Subscribe to tap events
      tapUnsubscribe = tapBroadcaster.subscribe((event) => {
        // Lane filtering logic:
        // - If event has no lane, treat as 'default' (legacy compatibility)
        // - If client is on 'default', receive from all lanes
        // - If client is on specific lane (reader-1/reader-2), only receive from that lane
        // Normalize lane strings
        const eventLane = (event.lane || 'default').toString().trim() || 'default';
        const clientLane = (lane || 'default').toString().trim() || 'default';

        // Client wants specific lane, only receive from that exact lane
        if (clientLane !== 'default' && eventLane !== clientLane) {
          console.log(
            `[WS #${connectionId}] Skipping tap ${event.card_uid} - client lane='${clientLane}' event lane='${eventLane}'`
          );
          return;
        }

        // Send tap to client
        if (ws.readyState === ws.OPEN) {
          console.log(
            `[WS #${connectionId}] Sending tap event to client: ${event.card_uid} (lane: ${eventLane}, client lane: ${clientLane})`
          );
          ws.send(JSON.stringify(event));
        }
      });

      // Browser clients don't need ping keepalive - they maintain connection naturally
      // Removing ping interval to prevent page refresh every 30 seconds

    } else {
      console.warn(`[WS #${connectionId}] Invalid role: ${role}`);
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
      console.warn(`[WS #${connectionId}] Tap event missing card_uid`);
      return;
    }
    
    // Normalize lane coming from broadcaster/connection info
    let eventLane = message.lane || connectionInfo?.lane || 'default';
    if (typeof eventLane === 'string') {
      eventLane = eventLane.trim();
    }
    if (!eventLane) {
      console.warn(`[WS #${connectionId}] Tap event missing lane, dropping: ${message.card_uid}`);
      return;
    }

    const tapEvent = {
      card_uid: message.card_uid,
      lane: eventLane,
      reader_ts: message.reader_ts,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to all clients via tap broadcaster
    const broadcasted = tapBroadcaster.broadcast(tapEvent);

    if (broadcasted) {
      console.log(`[WS #${connectionId}] Tap received and broadcast: ${tapEvent.card_uid} (lane: ${tapEvent.lane})`);
    } else {
      console.log(`[WS #${connectionId}] Tap ignored (duplicate): ${tapEvent.card_uid}`);
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
    const duration = Date.now() - new Date(connectedAt).getTime();
    console.log(`[WS #${connectionId}] Connection closed (code: ${code}, reason: ${reason || 'none'}, duration: ${(duration / 1000).toFixed(1)}s, role: ${connectionInfo?.role || 'unauthenticated'})`);
    
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
    console.error(`[WS #${connectionId}] Socket error:`, error);
  });
}

