#!/bin/bash
# Run NFC broadcaster with proper environment

cd /home/qiss/stuco
source .venv/bin/activate

export NFC_TAP_SECRET=55ae2c9e1779b316d6d11b00d13c32a721e599ee21465dd927ed46dc1f3dd125
export PN532_DEVICE=tty:USB0:pn532
export NEXTJS_URL=http://localhost:3000
export POS_LANE_ID=default

echo "Starting NFC broadcaster..."
python tap-broadcaster.py "$@"

