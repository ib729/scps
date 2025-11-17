#!/bin/bash
# Automatic system update script
# Run via cron every Monday at 3 AM

set -e

LOG_FILE="/var/log/auto-update.log"
MAX_FAILURES=3
FAILURE_FILE="/var/tmp/auto-update-failures"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check failure count
check_failures() {
    if [ -f "$FAILURE_FILE" ]; then
        FAILURES=$(cat "$FAILURE_FILE")
        if [ "$FAILURES" -ge "$MAX_FAILURES" ]; then
            log "ERROR: Too many failures ($FAILURES). Skipping update. Run 'sudo rm $FAILURE_FILE' to reset."
            exit 1
        fi
    fi
}

# Increment failure count
increment_failures() {
    if [ -f "$FAILURE_FILE" ]; then
        FAILURES=$(cat "$FAILURE_FILE")
        echo $((FAILURES + 1)) > "$FAILURE_FILE"
    else
        echo "1" > "$FAILURE_FILE"
    fi
}

# Reset failure count on success
reset_failures() {
    rm -f "$FAILURE_FILE"
}

# Main update process
main() {
    log "Starting system update..."
    
    # Check if we should skip due to too many failures
    check_failures
    
    # Update package lists
    if ! apt update >> "$LOG_FILE" 2>&1; then
        log "ERROR: apt update failed"
        increment_failures
        exit 1
    fi
    
    # Upgrade packages
    if ! apt upgrade -y >> "$LOG_FILE" 2>&1; then
        log "ERROR: apt upgrade failed"
        increment_failures
        exit 1
    fi
    
    # Remove unnecessary packages
    apt autoremove -y >> "$LOG_FILE" 2>&1 || true
    
    # Clean up package cache
    apt autoclean >> "$LOG_FILE" 2>&1 || true
    
    # Success!
    reset_failures
    log "System update completed successfully"
}

# Run main function
main

