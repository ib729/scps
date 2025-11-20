#!/bin/bash
# Reset NFC Readers and Services
# This script stops services, reloads USB drivers, and restarts everything.
# Useful when readers become unresponsive or "stuck".

set -e

echo "[FIX] Stopping services..."
sudo systemctl stop tap-broadcaster.service tap-broadcaster-reader2.service

echo "[FIX] Resetting USB Serial drivers (ch341)..."
sudo modprobe -r ch341
sleep 2
sudo modprobe ch341
sleep 3

echo "[FIX] Starting reader services..."
sudo systemctl start tap-broadcaster.service tap-broadcaster-reader2.service

echo "[FIX] Done! Checking status..."
sleep 2
sudo systemctl status tap-broadcaster.service tap-broadcaster-reader2.service --no-pager | grep "Active:"

