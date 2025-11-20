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


def auto_detect_nfc_device() -> tuple[Optional[str], Optional[str]]:
    """
    Auto-detect NFC reader device and assign reader_id.

    Returns:
        Tuple of (device_string, reader_id)
        device_string: nfcpy format like 'tty:USB0:pn532'
        reader_id: 'reader-1' or 'reader-2' based on USB port
    """
    import os
    import glob

    # Find all ttyUSB devices
    tty_devices = sorted(glob.glob('/dev/ttyUSB*'))

    if not tty_devices:
        print("[DEVICE] No /dev/ttyUSB* devices found")
        return None, None

    # Check if device was specified via env var
    specified_device = os.getenv('PN532_DEVICE')
    if specified_device and not specified_device.startswith('tty:'):
        # Device specified but not in our auto-detect list
        print(f"[DEVICE] Using specified device: {specified_device}")
        return specified_device, 'reader-1'  # Default to reader-1 for non-USB devices

    # Try each USB device until one works
    for idx, tty_path in enumerate(tty_devices):
        # Extract device name (e.g., 'USB0' from '/dev/ttyUSB0')
        tty_name = os.path.basename(tty_path).replace('tty', '')
        device_string = f'tty:{tty_name}:pn532'
        reader_id = f'reader-{idx + 1}'  # reader-1, reader-2, etc.

        print(f"[DEVICE] Detected: {tty_path} -> {device_string} ({reader_id})")

        # Try to open the device to verify it's accessible
        try:
            # Test if we can connect to this device
            import nfc
            with nfc.ContactlessFrontend(device_string) as clf:
                print(f"[DEVICE] Successfully opened {device_string} as {reader_id}")
                return device_string, reader_id
        except Exception as e:
            print(f"[DEVICE] Failed to open {device_string}: {e}")
            continue

    print("[DEVICE] No working NFC readers found")
    return None, None


def read_uid_from_pn532(device: str) -> Optional[str]:
    """
    Read card UID from PN532 reader (blocking) with enhanced error detection.

    Args:
        device: Device string (e.g., 'tty:AMA0:pn532', 'usb:001:003', 'i2c:/dev/i2c-1:pn532')

    Returns:
        Card UID as hex string, or None if no card detected
        
    Raises:
        Exception: If hardware is unresponsive after multiple retries (fatal error)
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

    # Retry logic for hardware stability
    max_retries = 3
    timeout_count = 0
    fatal_error = None
    
    for attempt in range(max_retries):
        try:
            # Small delay to let UART settle
            time.sleep(0.2)
            
            with nfc.ContactlessFrontend(device) as clf:
                clf.connect(rdwr={"on-connect": on_connect}, terminate=lambda: shutdown_event.is_set())
            return uid_hex["val"]
            
        except IOError as e:
            error_str = str(e).lower()
            
            # Categorize errors for better handling
            if "timeout" in error_str or "timed out" in error_str:
                timeout_count += 1
                if attempt < max_retries - 1:
                    # Wait progressively longer for timeouts
                    time.sleep(0.5 * (attempt + 1))
                else:
                    # Multiple timeouts indicate hardware issue
                    print(f"[ERROR] Device {device} timeout after {max_retries} attempts")
                    print(f"[ERROR] Hardware may be locked up or disconnected")
                    fatal_error = e
                    
            elif "permission denied" in error_str:
                print(f"[ERROR] Permission denied accessing {device}")
                print(f"[ERROR] Add user to dialout group: sudo usermod -aG dialout $USER")
                fatal_error = e
                break  # Don't retry permission errors
                
            elif "no such file or directory" in error_str or "not found" in error_str:
                print(f"[ERROR] Device {device} not found - may be disconnected")
                fatal_error = e
                break  # Don't retry if device doesn't exist
                
            elif "device or resource busy" in error_str:
                print(f"[ERROR] Device {device} is busy - another process may be using it")
                if attempt < max_retries - 1:
                    time.sleep(1)  # Wait longer for busy device
                else:
                    fatal_error = e
                    
            else:
                # Unknown IO error
                if attempt == max_retries - 1:
                    print(f"[ERROR] IO error on {device}: {e}")
                    fatal_error = e
                else:
                    time.sleep(0.5)
                    
        except OSError as e:
            # OS-level errors often indicate hardware disconnection
            print(f"[ERROR] OS error accessing {device}: {e}")
            fatal_error = e
            break
            
        except Exception as e:
            # Unexpected errors
            error_str = str(e).lower()
            if "broken pipe" in error_str or "connection" in error_str:
                print(f"[ERROR] Connection error on {device}: {e}")
                fatal_error = e
                break
            else:
                # For other exceptions, just return None
                if attempt == max_retries - 1:
                    print(f"[ERROR] Unexpected error on {device}: {e}")
                return None
    
    # If we had multiple timeouts or fatal errors, raise exception
    # This will trigger hardware reconnection logic
    if timeout_count >= max_retries:
        raise Exception(f"Hardware timeout: Device {device} unresponsive after {max_retries} attempts")
    if fatal_error:
        raise Exception(f"Hardware error: {fatal_error}")
            
    return None


def read_uid_from_libnfc() -> Optional[str]:
    """
    Read card UID using libnfc command-line tool (for I2C devices) with enhanced error detection.
    
    Returns:
        Card UID as hex string, or None if no card detected
        
    Raises:
        Exception: If hardware is unresponsive after multiple failures (fatal error)
    """
    max_retries = 3
    timeout_count = 0
    
    for attempt in range(max_retries):
        try:
            # Use nfc-list which is faster and doesn't wait for card removal
            # 5-second timeout allows time for I2C initialization
            result = subprocess.run(
                ["nfc-list"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            # Check for error messages in output
            if "error" in result.stderr.lower() or "unable" in result.stderr.lower():
                if attempt == max_retries - 1:
                    print(f"[ERROR] libnfc error: {result.stderr}")
                    raise Exception(f"libnfc hardware error: {result.stderr}")
                time.sleep(0.5)
                continue
            
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
            timeout_count += 1
            # Timeout means no card was detected or hardware is slow
            if attempt == max_retries - 1 and timeout_count >= max_retries:
                print(f"[ERROR] libnfc timeout after {max_retries} attempts - hardware may be stuck")
                raise Exception("libnfc hardware timeout: Device unresponsive")
            return None
            
        except Exception as e:
            # Unexpected errors
            if attempt == max_retries - 1:
                print(f"[ERROR] libnfc unexpected error: {e}")
                raise Exception(f"libnfc error: {e}")
            time.sleep(0.5)
    
    return None


async def broadcast_tap_ws(websocket, card_uid: str, lane: str, reader_id: Optional[str] = None) -> bool:
    """
    Send tap event via WebSocket.

    Args:
        websocket: WebSocket connection
        card_uid: Card UID to broadcast
        lane: Lane identifier (for backward compatibility)
        reader_id: Reader identifier (e.g., 'reader-1', 'reader-2')

    Returns:
        True if successful, False otherwise
    """
    # Normalize lane/reader identifiers so every message is consistently tagged
    # - Prefer explicit reader_id (e.g., 'reader-1')
    # - Fall back to lane value (e.g., POS_LANE_ID) if reader_id is missing
    # - Never send empty/None lane values
    try:
        normalized_lane = (reader_id or lane or "default") or "default"
        # Ensure we always send simple string identifiers
        normalized_lane = str(normalized_lane).strip() or "default"
        normalized_reader_id = str(reader_id or normalized_lane).strip()

        message = {
            "type": "tap",
            "card_uid": card_uid,
            "lane": normalized_lane,
            "reader_id": normalized_reader_id,
            "reader_ts": datetime.now(timezone.utc).isoformat(),
        }

        await websocket.send(json.dumps(message))
        print(
            f"[OK] Tap broadcast: {card_uid} "
            f"(lane: {normalized_lane}, reader_id: {normalized_reader_id})"
        )
        return True

    except Exception as e:
        print(f"[ERROR] Failed to broadcast tap: {e}")
        return False


async def nfc_reader_loop(websocket, device: str, lane: str, reader_id: Optional[str] = None):
    """
    Continuous NFC reader loop with card presence tracking.

    Args:
        websocket: WebSocket connection
        device: NFC device string
        lane: Lane identifier (for backward compatibility)
        reader_id: Reader identifier (e.g., 'reader-1', 'reader-2')
    """
    print(f"[NFC] Starting card reader loop on {device}")
    if reader_id:
        print(f"[NFC] Reader ID: {reader_id}")
    print("[NFC] Waiting for card tap...")

    loop = asyncio.get_event_loop()
    consecutive_failures = 0
    last_success_time = time.time()

    while not shutdown_event.is_set():
        try:
            # Read UID in thread pool (blocking call)
            uid = await loop.run_in_executor(None, read_uid_from_pn532, device)

            if uid:
                # Check if we should broadcast this tap
                if card_state.should_broadcast(uid):
                    await broadcast_tap_ws(websocket, uid, lane, reader_id)
                else:
                    # Card still present, don't rebroadcast
                    pass

                # Reset failure counter on successful read
                consecutive_failures = 0
                last_success_time = time.time()

                # Small delay to prevent excessive polling
                await asyncio.sleep(0.1)
            else:
                # No card detected, reset state
                card_state.reset()

                # Check if we've been getting None for too long (potential hardware issue)
                time_since_success = time.time() - last_success_time
                if time_since_success > 60:  # 60 seconds of no reads might indicate hardware issue
                    consecutive_failures += 1
                    if consecutive_failures > 3:
                        print(f"[WARNING] No card reads for {time_since_success:.0f}s (failure #{consecutive_failures})")
                        # This might be normal (no cards), but log it for awareness
                    last_success_time = time.time()  # Reset to avoid spam

                # Small delay before next poll
                await asyncio.sleep(0.1)

        except asyncio.CancelledError:
            print("[NFC] Reader loop cancelled")
            break
        except Exception as e:
            consecutive_failures += 1
            print(f"[ERROR] Reader error (failure #{consecutive_failures}): {e}")
            
            # If we have many consecutive failures, hardware might be stuck
            if consecutive_failures >= 10:
                print(f"[ERROR] Too many consecutive failures ({consecutive_failures}), hardware may need reset")
                # Raise exception to trigger hardware reconnection
                raise
            
            await asyncio.sleep(1)  # Wait before retry on error


async def nfc_reader_loop_with_reconnection(websocket, device: str, lane: str, reader_id: Optional[str] = None):
    """
    Wrapper around nfc_reader_loop that handles automatic hardware reconnection.
    
    If the NFC hardware becomes unresponsive or fails repeatedly, this function
    will automatically attempt to reinitialize the connection with exponential backoff.
    This ensures the reader keeps working without manual intervention.
    
    Args:
        websocket: WebSocket connection
        device: NFC device string
        lane: Lane identifier (for backward compatibility)
        reader_id: Reader identifier (e.g., 'reader-1', 'reader-2')
    """
    reconnect_delay = 1
    max_reconnect_delay = 30
    reconnect_attempt = 0
    
    while not shutdown_event.is_set():
        try:
            # Attempt to run the NFC reader loop
            await nfc_reader_loop(websocket, device, lane, reader_id)
            
            # If we get here, the loop exited normally (shutdown)
            break
            
        except asyncio.CancelledError:
            print("[NFC] Hardware reconnection cancelled")
            break
            
        except Exception as e:
            reconnect_attempt += 1
            print(f"[NFC] Hardware connection lost: {e}")
            print(f"[NFC] Attempting hardware reconnection #{reconnect_attempt} in {reconnect_delay}s...")
            
            # Wait before attempting reconnection
            await asyncio.sleep(reconnect_delay)
            
            if shutdown_event.is_set():
                break
            
            # Try to reinitialize hardware by testing the connection
            print(f"[NFC] Reinitializing hardware connection to {device}...")
            try:
                # Test if we can connect to the device
                import nfc
                loop = asyncio.get_event_loop()
                
                def test_hardware():
                    """Quick hardware test"""
                    try:
                        with nfc.ContactlessFrontend(device) as clf:
                            return True
                    except Exception as test_e:
                        print(f"[NFC] Hardware test failed: {test_e}")
                        return False
                
                # Run hardware test in executor
                hardware_ok = await loop.run_in_executor(None, test_hardware)
                
                if hardware_ok:
                    print(f"[NFC] Hardware reconnection successful! Resuming reader loop...")
                    # Reset delay on successful reconnection
                    reconnect_delay = 1
                    reconnect_attempt = 0
                    # Continue to next iteration to restart the reader loop
                    continue
                else:
                    print(f"[NFC] Hardware not ready yet, will retry...")
                    
            except Exception as test_e:
                print(f"[NFC] Error during hardware reconnection test: {test_e}")
            
            # Exponential backoff for next attempt
            reconnect_delay = min(reconnect_delay * 2, max_reconnect_delay)
            print(f"[NFC] Next reconnection attempt in {reconnect_delay}s...")


async def simulation_mode(websocket, lane: str, reader_id: Optional[str] = None):
    """
    Interactive simulation mode - manually type UIDs.

    Args:
        websocket: WebSocket connection
        lane: Lane identifier (for backward compatibility)
        reader_id: Reader identifier (e.g., 'reader-1', 'reader-2')
    """
    print("[SIMULATE] Manual UID entry mode. Type UID hex (or 'quit'):")
    if reader_id:
        print(f"[SIMULATE] Simulating {reader_id}")

    loop = asyncio.get_event_loop()

    while not shutdown_event.is_set():
        try:
            # Read input in thread pool (blocking call)
            uid = await loop.run_in_executor(None, lambda: input("> ").strip())

            if uid.lower() in ("q", "quit", "exit"):
                break

            if not uid:
                continue

            await broadcast_tap_ws(websocket, uid.upper(), lane, reader_id)

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


async def websocket_broadcaster(url: str, secret: Optional[str], lane: str, device: str, simulate: bool, reader_id: Optional[str] = None):
    """
    Main WebSocket broadcaster with automatic reconnection.

    Args:
        url: Server URL (http://localhost:3000)
        secret: Shared secret for authentication
        lane: Lane identifier (for backward compatibility)
        device: NFC device string
        simulate: Whether to run in simulation mode
        reader_id: Reader identifier (e.g., 'reader-1', 'reader-2')
    """
    # Convert HTTP URL to WebSocket URL
    ws_url = url.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_url}/api/nfc/ws"

    # Use reader_id as lane if available (maintains compatibility with existing server logic)
    effective_lane = reader_id or lane

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
                if not await authenticate_websocket(websocket, secret, effective_lane):
                    print("[WS] Disconnecting due to auth failure")
                    await asyncio.sleep(5)
                    continue

                # Reset retry delay on successful connection
                retry_delay = 1

                # Start NFC reader or simulation
                if simulate:
                    await simulation_mode(websocket, effective_lane, reader_id)
                else:
                    await nfc_reader_loop_with_reconnection(websocket, device, effective_lane, reader_id)
                
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


async def test_mode(url: str, secret: Optional[str], lane: str, reader_id: Optional[str] = None):
    """
    Test mode - send a single test tap and exit.

    Args:
        url: Server URL
        secret: Shared secret
        lane: Lane identifier (for backward compatibility)
        reader_id: Reader identifier (e.g., 'reader-1', 'reader-2')

    Returns:
        0 if successful, 1 otherwise
    """
    ws_url = url.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_url}/api/nfc/ws"

    # Use reader_id as lane if available
    effective_lane = reader_id or lane

    print("[TEST] Sending test tap event...")
    test_uid = "DEADBEEF"

    try:
        async with websockets.connect(ws_url, ping_interval=None) as websocket:
            # Authenticate
            if not await authenticate_websocket(websocket, secret, effective_lane):
                print("[TEST] Authentication failed")
                return 1

            # Send test tap
            success = await broadcast_tap_ws(websocket, test_uid, effective_lane, reader_id)

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

    # Auto-detect device and reader ID if not in simulation/test mode
    reader_id = None
    final_device = args.device

    # Only auto-detect if PN532_DEVICE env var is NOT explicitly set
    # This prevents race conditions when multiple services start simultaneously
    if not args.simulate and not args.test and not os.getenv('PN532_DEVICE'):
        detected_device, detected_reader_id = auto_detect_nfc_device()
        if detected_device:
            final_device = detected_device
            reader_id = detected_reader_id
            print(f"[DEVICE] Auto-detected: {final_device} -> {reader_id}")
        else:
            print(f"[DEVICE] Auto-detection failed, using specified device: {final_device}")
            # Try to infer reader_id from device string
            if 'USB0' in final_device:
                reader_id = 'reader-1'
            elif 'USB1' in final_device:
                reader_id = 'reader-2'
    else:
        # PN532_DEVICE is explicitly set - use it directly without auto-detection
        if not args.simulate and not args.test:
            print(f"[DEVICE] Using explicitly configured device: {final_device}")
            # Infer reader_id from device string when possible
            if 'USB0' in final_device:
                reader_id = 'reader-1'
            elif 'USB1' in final_device:
                reader_id = 'reader-2'
        elif args.simulate:
            # For simulation, try to infer from device or lane
            if 'USB0' in args.device or '1' in args.lane:
                reader_id = 'reader-1'
            elif 'USB1' in args.device or '2' in args.lane:
                reader_id = 'reader-2'

    # Final safety net: always have a non-empty reader_id for tagging events
    if reader_id is None:
        reader_id = args.lane or 'default'
        print(f"[DEVICE] No explicit reader_id detected, falling back to lane value: {reader_id}")

    print(f"""
╔═══════════════════════════════════════════════════════════════╗
║         NFC Tap Broadcaster for SCPS POS System              ║
║                    WebSocket Version                         ║
╠═══════════════════════════════════════════════════════════════╣
║ Server:  {args.url:<52} ║
║ Lane:    {args.lane:<52} ║
║ Reader:  {reader_id or 'auto':<52} ║
║ Device:  {final_device:<52} ║
║ Secret:  {'[SET]' if args.secret else '[NOT SET]':<52} ║
║ Mode:    {'TEST' if args.test else 'SIMULATE' if args.simulate else 'HARDWARE':<52} ║
╚═══════════════════════════════════════════════════════════════╝
""")

    # Test mode - send single tap and exit
    if args.test:
        exit_code = await test_mode(args.url, args.secret, args.lane, reader_id)
        sys.exit(exit_code)

    # Main broadcaster mode
    try:
        await websocket_broadcaster(
            args.url,
            args.secret,
            args.lane,
            final_device,
            args.simulate,
            reader_id
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
