import os

# ==============================================================================
# SCPS Configuration
# ==============================================================================

# Database Configuration
# Path to the SQLite database file.
DB_PATH = os.getenv("SCPS_DB_PATH", "stuco.db")

# Timezone Configuration
# Used for timestamping transactions.
TIMEZONE = os.getenv("SCPS_TIMEZONE", "Asia/Shanghai")

# NFC Configuration
# ------------------------------------------------------------------------------
# Single Reader:
#   The script uses DEFAULT_NFC_DEVICE if no arguments are provided.
#
# Multiple Readers:
#   To use multiple readers, run multiple instances of 'tap-broadcaster.py'.
#   The script supports auto-detection:
#     - Instance 1 will pick up /dev/ttyUSB0 (reader-1)
#     - Instance 2 will pick up /dev/ttyUSB1 (reader-2)
#   Alternatively, specify the device explicitly in your systemd service or command:
#     python tap-broadcaster.py --device tty:USB0:pn532 --lane reader-1
#     python tap-broadcaster.py --device tty:USB1:pn532 --lane reader-2
# ------------------------------------------------------------------------------
DEFAULT_NFC_DEVICE = os.getenv("PN532_DEVICE", "tty:AMA0:pn532")
NFC_DEBOUNCE_SECONDS = 1.5
NFC_TIMEOUT_SECONDS = 1.0

# WebSocket / Server Configuration
# ------------------------------------------------------------------------------
# DEFAULT_SERVER_URL:
#   The URL of your Next.js web application.
#   - If running locally: http://localhost:3000
#   - If running on a domain: https://your-domain.com
#   - If using a specific IP: http://192.168.1.100:3000
#   Ensure this matches where your Next.js server is running.
# ------------------------------------------------------------------------------
DEFAULT_SERVER_URL = os.getenv("NEXTJS_URL", "http://localhost:3000")
DEFAULT_LANE_ID = os.getenv("POS_LANE_ID", "default")
NFC_TAP_SECRET = os.getenv("NFC_TAP_SECRET")

# Hardware / GPIO Configuration
# Note: Most NFC interaction is handled via nfcpy/libnfc device strings.
# If raw GPIO pins are needed later, define them here.