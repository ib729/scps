"use client";

/**
 * WebSocket Hook for NFC Tap Events
 * 
 * Provides a React hook for connecting to the NFC tap WebSocket endpoint.
 * Handles authentication, reconnection, and message processing.
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Connection status tracking
 * - Lane filtering support
 * - Automatic cleanup on unmount
 * - TypeScript types for all events
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { type TapEvent } from "./tap-events";

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

interface UseNFCWebSocketOptions {
  /**
   * Lane to filter events by (default: "default")
   */
  lane?: string;
  
  /**
   * Whether to automatically connect (default: true)
   */
  autoConnect?: boolean;
  
  /**
   * Callback when a tap is received
   */
  onTap?: (event: TapEvent) => void;
  
  /**
   * Callback when connection status changes
   */
  onConnectionChange?: (connected: boolean) => void;
  
  /**
   * Callback for errors
   */
  onError?: (error: Error) => void;
}

interface UseNFCWebSocketReturn {
  /**
   * Whether the WebSocket is connected
   */
  isConnected: boolean;
  
  /**
   * The last tap event received
   */
  lastTap: TapEvent | null;
  
  /**
   * Connection status message
   */
  statusMessage: string;
  
  /**
   * Manually connect to WebSocket
   */
  connect: () => void;
  
  /**
   * Manually disconnect from WebSocket
   */
  disconnect: () => void;
  
  /**
   * Reconnect to WebSocket
   */
  reconnect: () => void;
}

/**
 * React hook for NFC WebSocket connection
 * 
 * @example
 * ```tsx
 * const { isConnected, lastTap } = useNFCWebSocket({
 *   lane: "default",
 *   onTap: (event) => console.log("Tap:", event.card_uid)
 * });
 * ```
 */
export function useNFCWebSocket(
  options: UseNFCWebSocketOptions = {}
): UseNFCWebSocketReturn {
  const {
    lane = "default",
    autoConnect = true,
    onTap,
    onConnectionChange,
    onError,
  } = options;

  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);

  const [isConnected, setIsConnected] = useState(false);
  const [lastTap, setLastTap] = useState<TapEvent | null>(null);
  const [statusMessage, setStatusMessage] = useState("Disconnected");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef(1000); // Start with 1 second
  const isManualDisconnectRef = useRef(false);
  const isAuthenticatedRef = useRef(false);

  /**
   * Get WebSocket URL (convert http to ws)
   * No lane parameter - all clients get all taps, filtering happens in components
   */
  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    return `${protocol}//${host}/api/nfc/ws`;
  }, []);

  /**
   * Handle incoming WebSocket messages
   */
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);

        switch (data.type) {
          case "auth_success":
            isAuthenticatedRef.current = true;
            console.log("[NFC WS] Authenticated successfully");
            break;

          case "auth_failed":
            console.error("[NFC WS] Authentication failed:", data.message);
            setStatusMessage(`Authentication failed: ${data.message || "Unknown error"}`);
            if (onError) {
              onError(new Error(`Authentication failed: ${data.message}`));
            }
            break;

          case "ping":
            // Respond to ping with pong
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: "pong" }));
            }
            break;

          case "error":
            console.error("[NFC WS] Server error:", data.message);
            if (onError) {
              onError(new Error(data.message));
            }
            break;

          default:
            // Check if this is a tap event (has card_uid)
            if (data.card_uid) {
              const tapEvent: TapEvent = {
                card_uid: data.card_uid,
                lane: data.lane,
                reader_ts: data.reader_ts,
                timestamp: data.timestamp,
              };

              // Pass all taps to components - they will filter based on selectedReader
              console.log(
                `[NFC WS] Tap received:`,
                tapEvent.card_uid,
                `from lane: ${tapEvent.lane}`
              );

              setLastTap(tapEvent);

              if (onTap) {
                onTap(tapEvent);
              }
            }
            break;
        }
      } catch (error) {
        console.error("[NFC WS] Message parse error:", error);
        if (onError) {
          onError(error as Error);
        }
      }
    },
    [onTap, onError]
  );

  /**
   * Connect to WebSocket
   */
  const connect = useCallback(() => {
    // Don't connect if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    isManualDisconnectRef.current = false;
    isAuthenticatedRef.current = false;

    try {
      const wsUrl = getWebSocketUrl();
      console.log("[NFC WS] Connecting to:", wsUrl);
      setStatusMessage("Connecting...");

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[NFC WS] Connection opened");
        setIsConnected(true);
        setStatusMessage("Connected");
        reconnectDelayRef.current = 1000; // Reset reconnect delay

        // Send authentication message
        ws.send(JSON.stringify({
          type: "auth",
          role: "client",
        }));

        if (onConnectionChange) {
          onConnectionChange(true);
        }
      };

      ws.onmessage = handleMessage;

      ws.onerror = (error) => {
        console.error("[NFC WS] Connection error:", error);
        setStatusMessage("Connection error");
        
        if (onError) {
          onError(new Error("WebSocket connection error"));
        }
      };

      ws.onclose = (event) => {
        console.log("[NFC WS] Connection closed:", event.code, event.reason);
        setIsConnected(false);
        isAuthenticatedRef.current = false;
        wsRef.current = null;

        if (onConnectionChange) {
          onConnectionChange(false);
        }

        // Attempt to reconnect if not a manual disconnect
        if (!isManualDisconnectRef.current && autoConnect) {
          setStatusMessage(`Reconnecting in ${Math.round(reconnectDelayRef.current / 1000)}s...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("[NFC WS] Attempting to reconnect...");
            connect();
          }, reconnectDelayRef.current);

          // Exponential backoff with max delay of 30 seconds
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
        } else {
          setStatusMessage("Disconnected");
        }
      };
    } catch (error) {
      console.error("[NFC WS] Failed to create WebSocket:", error);
      setStatusMessage("Failed to connect");
      
      if (onError) {
        onError(error as Error);
      }
    }
  }, [getWebSocketUrl, handleMessage, autoConnect, onConnectionChange, onError]);

  /**
   * Disconnect from WebSocket
   */
  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;

    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnecting");
      wsRef.current = null;
    }

    setIsConnected(false);
    isAuthenticatedRef.current = false;
    setStatusMessage("Disconnected");
  }, []);

  /**
   * Reconnect to WebSocket
   */
  const reconnect = useCallback(() => {
    disconnect();
    reconnectDelayRef.current = 1000; // Reset delay
    setTimeout(() => {
      connect();
    }, 100);
  }, [connect, disconnect]);

  /**
   * Auto-connect on mount if enabled
   * Wait for lane to stabilize (give time for localStorage to load)
   */
  useEffect(() => {
    if (!autoConnect || hasConnectedOnce) {
      return;
    }

    // Wait a bit longer for lane to stabilize from localStorage (500ms instead of 100ms)
    const timer = setTimeout(() => {
      console.log(`[NFC WS] Initial connection with lane: ${lane}`);
      setHasConnectedOnce(true);
      connect();
    }, 500);

    return () => {
      clearTimeout(timer);
    };
    // Only run once on mount, wait for lane to stabilize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);  // Only depends on autoConnect

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lane changes don't require reconnection since we removed lane from URL
  // Components will filter taps based on their selectedReader

  return {
    isConnected,
    lastTap,
    statusMessage,
    connect,
    disconnect,
    reconnect,
  };
}

