#!/bin/bash
# Run NFC broadcaster with proper environment

cd /home/qiss/stuco
source .venv/bin/activate

# Load secret from .env.broadcaster file
if [ -f .env.broadcaster ]; then
  export $(cat .env.broadcaster | grep -v '^#' | xargs)
else
  echo "Warning: .env.broadcaster not found. NFC_TAP_SECRET not set."
  echo "Create .env.broadcaster with: NFC_TAP_SECRET=your-secret-here"
fi

# Set other environment variables (can be overridden)
export PN532_DEVICE=${PN532_DEVICE:-tty:USB0:pn532}
export NEXTJS_URL=${NEXTJS_URL:-http://localhost:3000}
export POS_LANE_ID=${POS_LANE_ID:-default}

echo "Starting NFC broadcaster..."
echo "  URL: $NEXTJS_URL"
echo "  Lane: $POS_LANE_ID"
echo "  Device: $PN532_DEVICE"
echo "  Secret: $([ -n "$NFC_TAP_SECRET" ] && echo "configured" || echo "NOT SET")"
echo

python tap-broadcaster.py "$@"

