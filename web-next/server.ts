/**
 * Custom Next.js Server with WebSocket Support
 * 
 * This custom server adds WebSocket support for NFC tap events
 * while maintaining all Next.js functionality.
 */

import dotenv from 'dotenv';
import { createServer, type IncomingMessage } from 'node:http';
import next from 'next';
import WebSocket, { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import { isIP } from 'node:net';
import fs from 'node:fs';
import { resolveDatabasePath } from './lib/database-path';
import Database from 'better-sqlite3';
import { assertCustomerSchema } from './lib/customer-schema';
import { registerReader } from './lib/nfc-readers';
import tapBroadcaster from './lib/tap-events';

dotenv.config({ path: '.env.local', quiet: true });

type BrowserSession = {
  userId: string;
  expiresAt: number | string | null;
  email: string;
  name: string;
  role: string;
};
type SessionResult =
  | { session: BrowserSession; sessionToken: string; error?: never }
  | { session?: never; sessionToken?: never; error: string };
type ConnectionInfo = {
  role: 'broadcaster' | 'client';
  lane: string;
  ip: string;
  connectedAt: string;
};
type SocketMessage =
  | { type: 'auth'; role?: unknown; secret?: unknown; lane?: unknown }
  | { type: 'tap'; card_uid?: unknown; lane?: unknown; reader_ts?: unknown }
  | { type: 'pong' };

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const DEFAULT_TRUSTED_ORIGINS = [
  'http://localhost:3000',
  'http://192.168.50.195:3000',
];
function getTrustedOrigins() {
  const configuredOrigins = [
    process.env.BETTER_AUTH_TRUSTED_ORIGINS,
    process.env.TRUSTED_ORIGINS,
    process.env.NEXT_PUBLIC_APP_URL,
  ]
    .flatMap((value) => (value ? value.split(',') : []))
    .map((origin) => origin.trim())
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_TRUSTED_ORIGINS, ...configuredOrigins]));
}

const trustedOrigins = new Set(
  getTrustedOrigins()
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
);

// Rate limiting: Track failed auth attempts per IP
const failedAttempts = new Map<string, { count: number; firstAttempt: number; blocked: number | null }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute window
const MAX_FAILED_ATTEMPTS = 5; // Max attempts per window
const BLOCK_DURATION = 300000; // 5 minutes block

// Connection tracking
let connectionCounter = 0;
let authDb: Database.Database | null = null;

function resolveDbPath() {
  const dbPath = resolveDatabasePath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite database not found at ${dbPath}`);
  }
  return dbPath;
}


function getAuthDb() {
  if (!authDb) {
    authDb = new Database(resolveDbPath());
    try {
      authDb.pragma('foreign_keys = ON');
      assertCustomerSchema(authDb);
    } catch (error) {
      authDb.close();
      authDb = null;
      throw error;
    }
  }

  return authDb;
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }

  try {
    return trustedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((cookies, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) {
      return cookies;
    }

    cookies[rawKey] = decodeURIComponent(rawValue.join('=') || '');
    return cookies;
  }, {});
}

function unsignCookieValue(value: string | null | undefined, secret: string | undefined): string | null {
  if (!value || !secret) {
    return null;
  }

  const signatureStart = value.lastIndexOf('.');
  if (signatureStart < 1) {
    return null;
  }

  const signedValue = value.slice(0, signatureStart);
  const signature = value.slice(signatureStart + 1);

  if (signature.length !== 44 || !signature.endsWith('=')) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedValue)
    .digest('base64');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const providedBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== providedBuffer.length) {
    return null;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ? signedValue
    : null;
}

function getSessionToken(request: IncomingMessage): string | null {
  try {
  const cookies = parseCookieHeader(request.headers.cookie);
  const rawToken = (
    cookies['__Secure-better-auth.session_token'] ||
    cookies['better-auth.session_token'] ||
    null
  );

  if (!rawToken) {
    return null;
  }

  return unsignCookieValue(rawToken, process.env.BETTER_AUTH_SECRET);
  } catch {
    return null;
  }
}

function validateBrowserSession(request: IncomingMessage, sessionToken = getSessionToken(request)): SessionResult {
  const origin = request.headers.origin;
  if (!isAllowedOrigin(origin)) {
    return { error: 'Origin not allowed' };
  }

  if (!sessionToken) {
    return { error: 'Missing session token' };
  }

  try {
  const session = getAuthDb()
    .prepare<[string], BrowserSession>(
      `
        SELECT
          s.userId,
          s.expiresAt,
          u.email,
          u.name,
          u.role
        FROM session s
        JOIN user u ON u.id = s.userId
        WHERE s.token = ?
        LIMIT 1
      `
    )
    .get(sessionToken);

  if (!session) {
    return { error: 'Invalid session' };
  }

  const expiry = session.expiresAt;
  const numeric = typeof expiry === 'number' || (typeof expiry === 'string' && /^\d+(?:\.\d+)?$/.test(expiry));
  const expiresAt = numeric ? Number(expiry) * (Number(expiry) < 1e12 ? 1000 : 1) : typeof expiry === 'string' ? Date.parse(expiry) : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { error: 'Expired or malformed session' };
  }

  if (session.role !== 'admin' && session.role !== 'staff') {
    return { error: 'Forbidden' };
  }

  return { session, sessionToken };
  } catch {
    return { error: 'Session authorization unavailable' };
  }
}

function safeCompareSecret(expected: string | undefined, provided: unknown): boolean {
  if (!expected || typeof provided !== 'string' || !provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Get client IP address from request
 */
function getClientIP(request: IncomingMessage): string {
  const peer = request.socket.remoteAddress?.toLowerCase().replace(/^::ffff:/, '') || '';
  const loopback = peer === '::1' || (isIP(peer) === 4 && peer.startsWith('127.'));
  const forwarded = request.headers['x-forwarded-for'];
  if (TRUST_PROXY && loopback && typeof forwarded === 'string') {
    const addresses = forwarded.split(',').map(value => value.trim().toLowerCase());
    for (let index = addresses.length - 1; index >= 0; index--) {
      if (isIP(addresses[index])) return addresses[index];
    }
  }
  return isIP(peer) ? peer : 'unknown';
}

/**
 * Mask secret for logging (show first 4 and last 4 chars)
 */
function maskSecret(secret: unknown): string {
  if (typeof secret !== 'string' || secret.length < 12) return '[INVALID]';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

/**
 * Check if IP is rate limited
 */
function isRateLimited(ip: string): boolean {
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
function recordFailedAttempt(ip: string): void {
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
function clearFailedAttempts(ip: string): void {
  failedAttempts.delete(ip);
}

getAuthDb();
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();


app.prepare().then(() => {
  const handleUpgrade = app.getUpgradeHandler();
  
  const server = createServer(async (req, res) => {
    req.headers['x-scps-client-ip'] = getClientIP(req);
    try {
      await handle(req, res);
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
    const requestUrl = new URL(
      request.url || '/',
      `http://${request.headers.host || `${hostname}:${port}`}`
    );
    const { pathname } = requestUrl;

    if (pathname === '/api/nfc/ws') {
      const origin = request.headers.origin;
      if (origin && !isAllowedOrigin(origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      handleUpgrade(request, socket, head);
    }
  });

  // WebSocket connection handler
  wss.on('connection', (ws, request) => {
    handleWebSocketConnection(ws, request);
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const client of wss.clients) client.terminate();
    wss.close();
    server.close(() => {
      app.close().then(() => {
        // Next's dev watchers can outlive close(); requests and sockets are drained first.
        process.exit(process.exitCode ?? 0);
      }).catch(error => {
        console.error('Error closing Next server', error);
        process.exit(1);
      });
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server ready on ws://${hostname}:${port}/api/nfc/ws`);
  });
});

/**
 * Handle WebSocket connection lifecycle
 */
function handleWebSocketConnection(ws: WebSocket, request: IncomingMessage) {
  let connectionInfo: ConnectionInfo | null = null;
  let authenticated = false;
  let pingInterval: NodeJS.Timeout | undefined;
  let tapUnsubscribe: (() => void) | null = null;
  let unregisterReader: (() => void) | null = null;
  let alive = true;
  ws.on('pong', () => { alive = true; });

  // Connection tracking and metadata
  const connectionId = ++connectionCounter;
  const connectedAt = new Date().toISOString();
  const clientIP = getClientIP(request);
  const userAgent = request.headers['user-agent'] || 'unknown';
  const origin = request.headers['origin'] || request.headers['referer'] || 'unknown';

  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const lane = url.searchParams.get('lane') || 'default';

  console.log(`[WS #${connectionId}] New connection from ${clientIP}`);
  console.log(`[WS #${connectionId}] User-Agent: ${userAgent}`);
  console.log(`[WS #${connectionId}] Origin: ${origin}`);
  
  // Rate limiting is applied later, only for failed broadcaster authentication
  // Browser clients are not rate limited

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const parsed: unknown = JSON.parse(data.toString());
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Invalid message');
      if (!('type' in parsed) || (parsed.type !== 'auth' && parsed.type !== 'tap' && parsed.type !== 'pong')) return;
      const message = parsed as SocketMessage;

      // Handle authentication
      if (message.type === 'auth') {
        if (authenticated) {
          ws.close(1008, 'Already authenticated');
          return;
        }
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
  async function handleAuthentication(ws: WebSocket, message: Extract<SocketMessage, { type: 'auth' }>, lane: string) {
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
      
      // Authenticate the reader broadcaster with the shared secret.
      const expectedSecret = process.env.NFC_TAP_SECRET;
      const providedSecret = message.secret;
      
      console.log(`[WS #${connectionId}] Broadcaster auth - Expected: ${maskSecret(expectedSecret)}, Provided: ${maskSecret(providedSecret)}`);
      
      if (!expectedSecret && !dev) {
        recordFailedAttempt(clientIP);
        console.error(`[WS #${connectionId}] NFC_TAP_SECRET is required outside development`);
        ws.send(JSON.stringify({
          type: 'auth_failed',
          message: 'Broadcaster authentication is unavailable'
        }));
        ws.close(1008, 'Authentication failed');
        return;
      }

      if (expectedSecret && !safeCompareSecret(expectedSecret, providedSecret)) {
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
        lane: typeof message.lane === 'string' && message.lane ? message.lane : lane,
        ip: clientIP,
        connectedAt,
      };

      authenticated = true;
      unregisterReader = registerReader(connectionInfo.lane, ws);

      console.log(`[WS #${connectionId}] ✓ Broadcaster authenticated successfully (lane: ${connectionInfo.lane})`);

      ws.send(JSON.stringify({
        type: 'auth_success',
        role: 'broadcaster',
        lane: connectionInfo.lane
      }));

      // Start ping interval
      startPingInterval();

    } else if (role === 'client') {
      const sessionResult = validateBrowserSession(request);
      if (!sessionResult.session) {
        console.warn(
          `[WS #${connectionId}] Browser client rejected: ${sessionResult.error}`
        );
        ws.send(JSON.stringify({
          type: 'auth_failed',
          message: 'Unauthorized'
        }));
        ws.close(1008, 'Authentication failed');
        return;
      }
      
      connectionInfo = {
        role: 'client',
        lane: lane,
        ip: clientIP,
        connectedAt,
      };

      authenticated = true;
      const sessionToken = sessionResult.sessionToken;

      console.log(`[WS #${connectionId}] ✓ Browser client authenticated (${sessionResult.session.email}, lane: ${lane})`);

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

        if (!validateBrowserSession(request, sessionToken).session) {
          if (tapUnsubscribe) tapUnsubscribe();
          ws.close(1008, 'Session no longer authorized');
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
  function handleTapEvent(message: Extract<SocketMessage, { type: 'tap' }>) {
    if (typeof message.card_uid !== 'string' || !message.card_uid) {
      console.warn(`[WS #${connectionId}] Tap event missing card_uid`);
      return;
    }
    
    // Normalize lane coming from broadcaster/connection info
    let eventLane = typeof message.lane === 'string' && message.lane || connectionInfo?.lane || 'default';
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
      reader_ts: typeof message.reader_ts === 'string' ? message.reader_ts : undefined,
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
      if (!alive || ws.readyState !== ws.OPEN) {
        if (unregisterReader) unregisterReader();
        clearInterval(pingInterval);
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 30000);
  }

  // Handle connection close
  ws.on('close', (code, reason) => {
    const duration = Date.now() - new Date(connectedAt).getTime();
    console.log(`[WS #${connectionId}] Connection closed (code: ${code}, reason: ${reason || 'none'}, duration: ${(duration / 1000).toFixed(1)}s, role: ${connectionInfo?.role || 'unauthenticated'})`);
    
    // Cleanup
    if (unregisterReader) unregisterReader();
    clearInterval(pingInterval);
    
    if (tapUnsubscribe) {
      tapUnsubscribe();
    }
  });

  // Handle errors
  ws.on('error', (error) => {
    if (unregisterReader) unregisterReader();
    console.error(`[WS #${connectionId}] Socket error:`, error);
  });
}
