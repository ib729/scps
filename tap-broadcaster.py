#!/usr/bin/env python3
"""
NFC Tap Broadcaster - WebSocket Version

Listens for card taps on the PN532 reader and broadcasts them to the
Next.js web UI via WebSocket connection.

Features:
- WebSocket connection with automatic reconnection
- Card presence tracking to prevent duplicate taps
- Continuous reader mode (keeps NFC connection open)
- Proper debouncing with UID tracking
- Simulation and test modes
- UART, USB, and I2C device support
- Graceful shutdown handling

Usage:
    python tap-broadcaster.py --url http://localhost:3000 --secret YOUR_SECRET
    python tap-broadcaster.py --simulate  # Test mode without hardware
    python tap-broadcaster.py --test      # Send single test tap and exit
"""

import argparse
import asyncio
import binascii
import json
import os
import re
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Optional, Callable

try:
    import websockets
except ImportError:
    print("Error: websockets module not found. Install with: pip install websockets")
    sys.exit(1)


# Global state for card tracking
class CardState:
    """Track card presence and prevent duplicate taps"""
    def __init__(self):
        self.last_uid: Optional[str] = None
        self.last_tap_time: float = 0
        self.debounce_seconds: float = 1.5
    
    def should_broadcast(self, uid: str) -> bool:
        """Check if this UID should be broadcast (not a duplicate)"""
        current_time = time.time()
        
        # New card or card was removed and re-tapped
        if uid != self.last_uid or (current_time - self.last_tap_time) > self.debounce_seconds:
            self.last_uid = uid
            self.last_tap_time = current_time
            return True
        
        return False
    
    def reset(self):
        """Reset state when card is removed"""
        self.last_uid = None


card_state = CardState()
shutdown_event = asyncio.Event()


def read_uid_from_pn532(device: str) -> Optional[str]:
    """
    Read card UID from PN532 reader (blocking).
    
    Args:
        device: Device string (e.g., 'tty:AMA0:pn532', 'usb:001:003', 'i2c:/dev/i2c-1:pn532')
    
    Returns:
        Card UID as hex string, or None if no card detected
    """
    # Check if device is I2C (nfcpy doesn't support I2C, use libnfc instead)
    if device.startswith("i2c") or "i2c" in device.lower():
        return read_uid_from_libnfc()
    
    # Use nfcpy for TTY/USB devices
    try:
        import nfc
    except ImportError:
        print("Error: nfcpy module not found. Install with: pip install nfcpy")
        sys.exit(1)

    uid_hex = {"val": None}

    def on_connect(tag):
        """Callback when card is detected"""
        uid = binascii.hexlify(tag.identifier).decode().upper()
        uid_hex["val"] = uid
        return False  # Release immediately for single-read mode

    try:
        with nfc.ContactlessFrontend(device) as clf:
            clf.connect(rdwr={"on-connect": on_connect}, terminate=lambda: shutdown_event.is_set())
        return uid_hex["val"]
    except Exception as e:
        # Return None on error - caller will handle retry
        return None


def read_uid_from_libnfc() -> Optional[str]:
    """
    Read card UID using libnfc command-line tool (for I2C devices).
    
    Returns:
        Card UID as hex string, or None if no card detected
    """
    try:
        # Use nfc-list which is faster and doesn't wait for card removal
        # 5-second timeout allows time for I2C initialization
        result = subprocess.run(
            ["nfc-list"],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        # Parse output for UID
        # Looking for line like: "       UID (NFCID1): ed  9d  25  02"
        for line in result.stdout.split("\n"):
            if "UID" in line and ("NFCID" in line or ":" in line):
                # Extract hex bytes after colon
                match = re.search(r':\s*((?:[0-9a-fA-F]{2}\s*)+)', line)
                if match:
                    uid_bytes = match.group(1).strip().replace(" ", "")
                    return uid_bytes.upper()
        
        return None
        
    except FileNotFoundError:
        print("Error: nfc-list not found. Install libnfc-bin: sudo apt install libnfc-bin")
        sys.exit(1)
    except subprocess.TimeoutExpired:
        # Timeout means no card was detected, return None to try again
        return None
    except Exception as e:
        # Return None on error - caller will handle retry
        return None


async def broadcast_tap_ws(websocket, card_uid: str, lane: str) -> bool:
    """
    Send tap event via WebSocket.
    
    Args:
        websocket: WebSocket connection
        card_uid: Card UID to broadcast
        lane: Lane identifier
    
    Returns:
        True if successful, False otherwise
    """
    try:
        message = {
            "type": "tap",
            "card_uid": card_uid,
            "lane": lane,
            "reader_ts": datetime.now(timezone.utc).isoformat(),
        }
        
        await websocket.send(json.dumps(message))
        print(f"[OK] Tap broadcast: {card_uid}")
        return True
        
    except Exception as e:
        print(f"[ERROR] Failed to broadcast tap: {e}")
        return False


async def nfc_reader_loop(websocket, device: str, lane: str):
    """
    Continuous NFC reader loop with card presence tracking.
    
    Args:
        websocket: WebSocket connection
        device: NFC device string
        lane: Lane identifier
    """
    print(f"[NFC] Starting card reader loop on {device}")
    print("[NFC] Waiting for card tap...")
    
    loop = asyncio.get_event_loop()
    
    while not shutdown_event.is_set():
        try:
            # Read UID in thread pool (blocking call)
            uid = await loop.run_in_executor(None, read_uid_from_pn532, device)
            
            if uid:
                # Check if we should broadcast this tap
                if card_state.should_broadcast(uid):
                    await broadcast_tap_ws(websocket, uid, lane)
                else:
                    # Card still present, don't rebroadcast
                    pass
                
                # Small delay to prevent excessive polling
                await asyncio.sleep(0.1)
            else:
                # No card detected, reset state
                card_state.reset()
                
                # Small delay before next poll
                await asyncio.sleep(0.1)
                
        except asyncio.CancelledError:
            print("[NFC] Reader loop cancelled")
            break
        except Exception as e:
            print(f"[ERROR] Reader error: {e}")
            await asyncio.sleep(1)  # Wait before retry on error


async def simulation_mode(websocket, lane: str):
    """
    Interactive simulation mode - manually type UIDs.
    
    Args:
        websocket: WebSocket connection
        lane: Lane identifier
    """
    print("[SIMULATE] Manual UID entry mode. Type UID hex (or 'quit'):")
    
    loop = asyncio.get_event_loop()
    
    while not shutdown_event.is_set():
        try:
            # Read input in thread pool (blocking call)
            uid = await loop.run_in_executor(None, lambda: input("> ").strip())
            
            if uid.lower() in ("q", "quit", "exit"):
                break
            
            if not uid:
                continue
            
            await broadcast_tap_ws(websocket, uid.upper(), lane)
            
        except (EOFError, KeyboardInterrupt):
            break
        except Exception as e:
            print(f"[ERROR] Simulation error: {e}")
    
    print("\n[EXIT] Exiting simulation mode.")


async def authenticate_websocket(websocket, secret: Optional[str], lane: str):
    """
    Authenticate with the WebSocket server.
    
    Args:
        websocket: WebSocket connection
        secret: Shared secret for authentication
        lane: Lane identifier
    """
    auth_message = {
        "type": "auth",
        "role": "broadcaster",
        "secret": secret or "",
        "lane": lane,
    }
    
    await websocket.send(json.dumps(auth_message))
    
    # Wait for auth response
    response = await websocket.recv()
    data = json.loads(response)
    
    if data.get("type") == "auth_success":
        print(f"[WS] Authenticated successfully (lane: {lane})")
        return True
    else:
        print(f"[WS] Authentication failed: {data.get('message', 'Unknown error')}")
        return False


async def websocket_broadcaster(url: str, secret: Optional[str], lane: str, device: str, simulate: bool):
    """
    Main WebSocket broadcaster with automatic reconnection.
    
    Args:
        url: Server URL (http://localhost:3000)
        secret: Shared secret for authentication
        lane: Lane identifier
        device: NFC device string
        simulate: Whether to run in simulation mode
    """
    # Convert HTTP URL to WebSocket URL
    ws_url = url.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_url}/api/nfc/ws"
    
    retry_delay = 1
    max_retry_delay = 60
    
    while not shutdown_event.is_set():
        try:
            print(f"[WS] Connecting to {ws_url}...")
            
            async with websockets.connect(
                ws_url,
                ping_interval=30,
                ping_timeout=10,
                close_timeout=5,
            ) as websocket:
                print("[WS] Connected successfully")
                
                # Authenticate
                if not await authenticate_websocket(websocket, secret, lane):
                    print("[WS] Disconnecting due to auth failure")
                    await asyncio.sleep(5)
                    continue
                
                # Reset retry delay on successful connection
                retry_delay = 1
                
                # Start NFC reader or simulation
                if simulate:
                    await simulation_mode(websocket, lane)
                else:
                    await nfc_reader_loop(websocket, device, lane)
                
        except websockets.exceptions.WebSocketException as e:
            print(f"[WS] Connection error: {e}")
        except ConnectionRefusedError:
            print(f"[WS] Connection refused - is the server running?")
        except Exception as e:
            print(f"[WS] Unexpected error: {e}")
        
        if shutdown_event.is_set():
            break
        
        # Exponential backoff for reconnection
        print(f"[WS] Reconnecting in {retry_delay}s...")
        await asyncio.sleep(retry_delay)
        retry_delay = min(retry_delay * 2, max_retry_delay)


async def test_mode(url: str, secret: Optional[str], lane: str):
    """
    Test mode - send a single test tap and exit.
    
    Args:
        url: Server URL
        secret: Shared secret
        lane: Lane identifier
    
    Returns:
        0 if successful, 1 otherwise
    """
    ws_url = url.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_url}/api/nfc/ws"
    
    print("[TEST] Sending test tap event...")
    test_uid = "DEADBEEF"
    
    try:
        async with websockets.connect(ws_url, ping_interval=None) as websocket:
            # Authenticate
            if not await authenticate_websocket(websocket, secret, lane):
                print("[TEST] Authentication failed")
                return 1
            
            # Send test tap
            success = await broadcast_tap_ws(websocket, test_uid, lane)
            
            if success:
                print("[TEST] Test tap sent successfully")
                return 0
            else:
                print("[TEST] Failed to send test tap")
                return 1
                
    except Exception as e:
        print(f"[TEST] Error: {e}")
        return 1


def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    print("\n[SIGNAL] Shutdown signal received")
    shutdown_event.set()


async def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="Broadcast NFC card taps to Next.js web UI via WebSocket"
    )
    parser.add_argument(
        "--url",
        default=os.getenv("NEXTJS_URL", "http://localhost:3000"),
        help="Next.js server URL (default: http://localhost:3000 or $NEXTJS_URL)",
    )
    parser.add_argument(
        "--secret",
        default=os.getenv("NFC_TAP_SECRET"),
        help="Shared secret for authentication (default: $NFC_TAP_SECRET)",
    )
    parser.add_argument(
        "--lane",
        default=os.getenv("POS_LANE_ID", "default"),
        help="POS lane identifier (default: 'default' or $POS_LANE_ID)",
    )
    parser.add_argument(
        "--device",
        default=os.getenv("PN532_DEVICE", "tty:AMA0:pn532"),
        help="NFC device string (default: tty:AMA0:pn532 or $PN532_DEVICE)",
    )
    parser.add_argument(
        "--simulate",
        action="store_true",
        help="Simulation mode: type UIDs manually (no hardware required)",
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Send a single test tap and exit",
    )
    
    args = parser.parse_args()
    
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    print(f"""
╔═══════════════════════════════════════════════════════════════╗
║         NFC Tap Broadcaster for SCPS POS System              ║
║                    WebSocket Version                         ║
╠═══════════════════════════════════════════════════════════════╣
║ Server:  {args.url:<52} ║
║ Lane:    {args.lane:<52} ║
║ Device:  {args.device:<52} ║
║ Secret:  {'[SET]' if args.secret else '[NOT SET]':<52} ║
║ Mode:    {'TEST' if args.test else 'SIMULATE' if args.simulate else 'HARDWARE':<52} ║
╚═══════════════════════════════════════════════════════════════╝
""")

    # Test mode - send single tap and exit
    if args.test:
        exit_code = await test_mode(args.url, args.secret, args.lane)
        sys.exit(exit_code)
    
    # Main broadcaster mode
    try:
        await websocket_broadcaster(
            args.url,
            args.secret,
            args.lane,
            args.device,
            args.simulate
        )
    except KeyboardInterrupt:
        pass
    
    print("[EXIT] Shutting down.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[EXIT] Interrupted.")
        sys.exit(0)
