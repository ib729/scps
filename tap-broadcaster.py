#!/usr/bin/env python3
"""
NFC Tap Broadcaster

Listens for card taps on the PN532 reader and broadcasts them to the
Next.js web UI via HTTP POST to /api/nfc/tap.

Usage:
    python tap-broadcaster.py --url http://localhost:3000 --secret YOUR_SECRET
    python tap-broadcaster.py --simulate  # For testing without hardware
"""

import argparse
import binascii
import os
import sys
import time
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    print("Error: requests module not found. Install with: pip install requests")
    sys.exit(1)


def read_uid_from_pn532(device):
    """Read card UID from PN532 reader."""
    try:
        import nfc
    except ImportError:
        print("Error: nfcpy module not found. Install with: pip install nfcpy")
        sys.exit(1)

    uid_hex = {"val": None}

    def on_connect(tag):
        uid_hex["val"] = binascii.hexlify(tag.identifier).decode().upper()
        return False  # Release immediately

    with nfc.ContactlessFrontend(device) as clf:
        print(f"[NFC] Waiting for card tap on {device}...")
        clf.connect(rdwr={"on-connect": on_connect})

    return uid_hex["val"]


def broadcast_tap(url, card_uid, lane, secret=None):
    """POST the tap event to the Next.js API."""
    endpoint = f"{url}/api/nfc/tap"
    
    payload = {
        "card_uid": card_uid,
        "lane": lane,
        "reader_ts": datetime.now(timezone.utc).isoformat(),
    }
    
    if secret:
        payload["secret"] = secret

    try:
        response = requests.post(
            endpoint,
            json=payload,
            timeout=5,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            listeners = data.get("listeners", 0)
            print(f"[OK] Tap broadcast: {card_uid} → {listeners} listener(s)")
            return True
        else:
            print(f"[ERROR] Server returned {response.status_code}: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] Failed to broadcast tap: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Broadcast NFC card taps to Next.js web UI"
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
        default="tty:AMA0:pn532",
        help="nfcpy device string (e.g., tty:AMA0:pn532, usb:USB0:pn532)",
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

    print(f"""
╔═══════════════════════════════════════════════════════════════╗
║         NFC Tap Broadcaster for Stuco POS System             ║
╠═══════════════════════════════════════════════════════════════╣
║ Server:  {args.url:<52} ║
║ Lane:    {args.lane:<52} ║
║ Device:  {args.device:<52} ║
║ Secret:  {'[SET]' if args.secret else '[NOT SET]':<52} ║
╚═══════════════════════════════════════════════════════════════╝
""")

    # Test mode
    if args.test:
        print("[TEST] Sending test tap event...")
        test_uid = "DEADBEEF"
        success = broadcast_tap(args.url, test_uid, args.lane, args.secret)
        sys.exit(0 if success else 1)

    # Simulation mode
    if args.simulate:
        print("[SIMULATE] Manual UID entry mode. Type UID hex (or 'quit'):")
        while True:
            try:
                uid = input("> ").strip()
                if uid.lower() in ("q", "quit", "exit"):
                    break
                if not uid:
                    continue
                broadcast_tap(args.url, uid.upper(), args.lane, args.secret)
            except (KeyboardInterrupt, EOFError):
                break
        print("\n[EXIT] Shutting down.")
        return

    # Hardware mode
    print("[NFC] Starting card reader loop. Press Ctrl+C to stop.")
    try:
        while True:
            uid = read_uid_from_pn532(args.device)
            if uid:
                broadcast_tap(args.url, uid, args.lane, args.secret)
                time.sleep(0.8)  # Debounce
    except KeyboardInterrupt:
        print("\n[EXIT] Shutting down.")


if __name__ == "__main__":
    main()

