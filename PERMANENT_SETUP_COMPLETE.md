# ✅ Permanent Setup Complete!

## 🎉 Everything is Now Auto-Starting on Boot

Both services are configured to start automatically when your Raspberry Pi boots up.

### Services Running:

#### 1. **stuco-web.service** - Next.js Web Server with WebSocket
- **Status:** ✅ Running
- **Port:** 3000
- **WebSocket:** ws://localhost:3000/api/nfc/ws
- **Auto-start:** Enabled

#### 2. **tap-broadcaster.service** - NFC Card Reader
- **Status:** ✅ Running
- **Device:** USB (`tty:USB0:pn532`)
- **Connection:** WebSocket to Next.js
- **Auto-start:** Enabled

## 🔧 Service Management Commands

### Check Status
```bash
# Both services
sudo systemctl status stuco-web tap-broadcaster

# Individual services
sudo systemctl status stuco-web
sudo systemctl status tap-broadcaster
```

### View Logs
```bash
# Live logs for both
journalctl -u stuco-web -u tap-broadcaster -f

# Last 50 lines
journalctl -u stuco-web -n 50
journalctl -u tap-broadcaster -n 50
```

### Control Services
```bash
# Restart
sudo systemctl restart stuco-web
sudo systemctl restart tap-broadcaster

# Stop
sudo systemctl stop stuco-web
sudo systemctl stop tap-broadcaster

# Start
sudo systemctl start stuco-web
sudo systemctl start tap-broadcaster

# Restart both
sudo systemctl restart stuco-web tap-broadcaster
```

### Disable Auto-Start (if needed)
```bash
sudo systemctl disable stuco-web
sudo systemctl disable tap-broadcaster
```

## 🌐 Access Your Application

- **Web UI:** http://localhost:3000 (or http://your-pi-ip:3000)
- **POS Page:** http://localhost:3000/pos
- **Dashboard:** http://localhost:3000/dashboard

## 🔄 What Happens on Reboot

When you reboot your Raspberry Pi:

1. ✅ Network starts
2. ✅ `stuco-web` service starts automatically
3. ✅ Next.js server loads with WebSocket support
4. ✅ `tap-broadcaster` service starts automatically
5. ✅ Connects to Next.js via WebSocket
6. ✅ Ready to detect NFC card taps

**Total startup time:** ~10-15 seconds

## 📊 Current Configuration

### Web Server (stuco-web)
- **Working Directory:** `/home/qiss/stuco/web-next`
- **Environment:** Production mode
- **Port:** 3000
- **Restart Policy:** On failure (5s delay)

### NFC Broadcaster (tap-broadcaster)
- **Working Directory:** `/home/qiss/stuco`
- **Device:** `tty:USB0:pn532` (USB connection)
- **Secret:** Configured ✓
- **Lane:** default
- **Restart Policy:** On failure (5s delay)

## 🧪 Testing After Reboot

After rebooting, verify everything works:

```bash
# 1. Check services are running
sudo systemctl status stuco-web tap-broadcaster

# 2. Test web server
curl http://localhost:3000

# 3. Check NFC broadcaster logs
journalctl -u tap-broadcaster -n 20

# Should show:
# [WS] Connected successfully
# [WS] Authenticated successfully
# [NFC] Waiting for card tap...
```

## 🔍 Troubleshooting

### Service Failed to Start

**Check logs:**
```bash
journalctl -u stuco-web -n 50
journalctl -u tap-broadcaster -n 50
```

**Common issues:**
- Port 3000 already in use
- USB device unplugged
- Build files missing (run `cd web-next && pnpm build`)

### NFC Not Detecting Cards

**Check device:**
```bash
ls -l /dev/ttyUSB0
```

**Restart broadcaster:**
```bash
sudo systemctl restart tap-broadcaster
journalctl -u tap-broadcaster -f
```

### WebSocket Not Connecting

**Check web server:**
```bash
curl http://localhost:3000
sudo systemctl status stuco-web
```

**Restart both services:**
```bash
sudo systemctl restart stuco-web tap-broadcaster
```

## 📝 Configuration Files

All configuration is in:
- `/etc/systemd/system/stuco-web.service`
- `/etc/systemd/system/tap-broadcaster.service`

To modify:
```bash
sudo nano /etc/systemd/system/stuco-web.service
sudo systemctl daemon-reload
sudo systemctl restart stuco-web
```

## 🎯 Production Ready Checklist

✅ Next.js built for production  
✅ WebSocket server configured  
✅ NFC broadcaster configured  
✅ USB device detected  
✅ Authentication secret set  
✅ Auto-start on boot enabled  
✅ Restart on failure enabled  
✅ Logs configured (journalctl)  

## 🚀 Next Steps

Your system is production-ready! You can now:

1. **Access from other devices** on your network using your Pi's IP address
2. **Set up HTTPS** if exposing to internet (use nginx reverse proxy)
3. **Configure firewall** if needed
4. **Monitor logs** periodically
5. **Test card enrollment and POS transactions**

## 📞 Support Commands

Quick reference for common tasks:

```bash
# See all logs in real-time
journalctl -u stuco-web -u tap-broadcaster -f

# Restart everything
sudo systemctl restart stuco-web tap-broadcaster

# Check disk space
df -h

# Check memory usage
free -h

# Reboot Pi
sudo reboot
```

## ✨ Summary

Your Stuco POS system with NFC card tap detection is now:
- ✅ Fully configured
- ✅ Production-ready
- ✅ Auto-starting on boot
- ✅ Self-healing (restarts on failure)
- ✅ Using WebSocket for real-time communication
- ✅ USB NFC reader configured and working

**Just reboot and it all starts automatically!** 🎊

