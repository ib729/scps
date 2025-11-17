# Dual Lane NFC Reader - Test Plan

## Changes Made

### 1. Fixed Server-Side Lane Filtering (`server.js`)
**Issue**: Events were being broadcast to all clients regardless of lane selection.

**Fix**: Simplified filtering logic:
```javascript
const eventLane = event.lane || 'default';

// Client wants specific lane, only receive from that exact lane
if (lane !== 'default' && eventLane !== lane) {
  // Skip - lanes don't match
  return;
}
```

**Behavior**:
- Client on `reader-1` only receives taps from broadcaster with `lane: "reader-1"`
- Client on `reader-2` only receives taps from broadcaster with `lane: "reader-2"`
- Client on `default` receives taps from all lanes
- Events without lane are treated as `default`

### 2. Simplified WebSocket Lane Change Logic (`use-nfc-websocket.ts`)
**Issue**: Complex lane change logic with race conditions.

**Fix**: Simplified reconnection flow:
- Only attempt reconnection if already connected
- Clean disconnect before reconnecting
- Reset reconnection backoff timer
- Clear manual disconnect flag after scheduling reconnect

### 3. Improved Context Initialization (`nfc-reader-context.tsx`)
**Issue**: Default value wasn't being saved to localStorage.

**Fix**: Save default to localStorage on first load to ensure consistency.

## Test Scenarios

### Setup
1. Start the Next.js development server:
   ```bash
   cd web-next && pnpm dev
   ```

2. Start two broadcaster instances (use separate terminals):
   ```bash
   # Terminal 1 - Reader 1
   python tap-broadcaster.py --simulate --lane reader-1 --url http://localhost:3000 --secret YOUR_SECRET

   # Terminal 2 - Reader 2
   python tap-broadcaster.py --simulate --lane reader-2 --url http://localhost:3000 --secret YOUR_SECRET
   ```

### Test Case 1: Basic Lane Filtering
**Steps**:
1. Open browser to `http://localhost:3000/pos`
2. Open Settings (sidebar) and select "Reader 1"
3. In Terminal 1 (reader-1), type a card UID (e.g., `AAAA1111`)
4. Verify the tap appears in the POS page
5. In Terminal 2 (reader-2), type a different UID (e.g., `BBBB2222`)
6. Verify the tap does NOT appear in the POS page

**Expected Result**: Only taps from reader-1 broadcaster appear.

### Test Case 2: Lane Switching
**Steps**:
1. Continue from Test Case 1 (Reader 1 selected)
2. Open Settings and switch to "Reader 2"
3. Check browser console for reconnection logs:
   - Should see: `[NFC WS] Lane changed to 'reader-2', reconnecting...`
   - Should see: `[NFC WS] Reconnecting with new lane: reader-2`
4. In Terminal 2 (reader-2), type a UID (e.g., `CCCC3333`)
5. Verify the tap appears in the POS page
6. In Terminal 1 (reader-1), type a UID (e.g., `DDDD4444`)
7. Verify the tap does NOT appear

**Expected Result**: After switching, only taps from reader-2 appear.

### Test Case 3: Multiple Browser Windows
**Steps**:
1. Open TWO browser windows/tabs to `http://localhost:3000/pos`
2. In Window 1: Set reader to "Reader 1" in settings
3. In Window 2: Set reader to "Reader 2" in settings
4. In Terminal 1 (reader-1), type UID `EEEE5555`
5. Verify tap appears ONLY in Window 1
6. In Terminal 2 (reader-2), type UID `FFFF6666`
7. Verify tap appears ONLY in Window 2

**Expected Result**: Each window receives taps only from its selected reader.

### Test Case 4: Persistence After Refresh
**Steps**:
1. Select "Reader 2" in settings
2. Refresh the browser page (F5)
3. Check console logs for:
   - `[NFCReaderContext] Initializing - stored value: reader-2`
   - `[NFCReaderContext] Setting reader from localStorage: reader-2`
4. In Terminal 2 (reader-2), type a UID
5. Verify tap appears in POS page

**Expected Result**: Reader selection persists across page refreshes.

### Test Case 5: Default Lane (Receives All)
**Note**: This requires a code change to allow "default" as a selectable option, or test with TapAlert component.

**Steps**:
1. Open a non-POS page (e.g., `/students`) where TapAlert is active
2. TapAlert uses `lane: selectedReader` but defaults if not set
3. Type UIDs in BOTH broadcaster terminals
4. Verify TapAlert drawer appears for taps from both readers

**Expected Result**: When on default lane, receives taps from all readers.

## Debugging

### Browser Console Logs to Watch

**Context initialization**:
```
[NFCReaderContext] Initializing - stored value: reader-1
[NFCReaderContext] Setting reader from localStorage: reader-1
```

**WebSocket connection**:
```
[NFC WS] Initial connection with lane: reader-1
[NFC WS] Connecting to: ws://localhost:3000/api/nfc/ws?lane=reader-1
[NFC WS] Connection opened
[NFC WS] Authenticated successfully
```

**Lane change**:
```
[NFCReaderContext] setSelectedReader called with: reader-2
[NFCReaderContext] Saved to localStorage: reader-2
[NFC WS] Lane changed to 'reader-2', reconnecting...
[NFC WS] Connection closed: 1000 Lane changed
[NFC WS] Reconnecting with new lane: reader-2
[NFC WS] Connecting to: ws://localhost:3000/api/nfc/ws?lane=reader-2
```

**Tap received**:
```
[POS] Card tap detected: AAAA1111
```

### Server Console Logs to Watch

**Client connection**:
```
[WS #1] New connection from ::1
[WS #1] Auth attempt - Role: client, IP: ::1
[WS #1] ✓ Browser client authenticated (lane: reader-1)
```

**Tap broadcast and filtering**:
```
[WS #2] Tap received and broadcast: AAAA1111 (lane: reader-1)
[WS #1] Sending tap event to client: AAAA1111 (lane: reader-1)
[WS #3] Skipping tap AAAA1111 - client lane='reader-2' event lane='reader-1'
```

**Lane change reconnection**:
```
[WS #1] Connection closed (code: 1000, reason: Lane changed, duration: 45.2s, role: client)
[WS #4] New connection from ::1
[WS #4] ✓ Browser client authenticated (lane: reader-2)
```

## Expected Behavior Summary

✅ **Correct Behavior**:
- Taps from reader-1 broadcaster only appear in clients subscribed to reader-1
- Taps from reader-2 broadcaster only appear in clients subscribed to reader-2
- Switching lanes causes WebSocket reconnection with new lane parameter
- Lane selection persists to localStorage and survives page refresh
- Multiple clients can connect to different lanes independently
- Server logs show proper filtering: "Skipping tap" for non-matching lanes

❌ **Incorrect Behavior** (before fixes):
- Taps appear in all clients regardless of lane selection
- Lane changes don't trigger reconnection
- Switching lanes doesn't update WebSocket URL parameter
- Server sends all taps to all clients

## Troubleshooting

### Issue: Taps appear in wrong lane
**Check**:
1. Broadcaster is sending correct `lane` parameter (check broadcaster console output)
2. Server logs show correct lane in broadcast message
3. Client WebSocket URL includes correct `?lane=` parameter (check browser Network tab)
4. Server filtering logic is executing (check server logs for "Skipping tap" messages)

### Issue: Lane change doesn't work
**Check**:
1. Browser console shows `[NFC WS] Lane changed to...` message
2. WebSocket disconnects and reconnects (check Network tab)
3. New connection has updated `lane` query parameter
4. localStorage is updated (Application tab > Local Storage)

### Issue: Settings don't persist
**Check**:
1. localStorage contains `nfc_reader_lane` key with value `reader-1` or `reader-2`
2. Console shows localStorage save message
3. On refresh, console shows loading from localStorage

## Implementation Notes

### Running Multiple Broadcasters

You need TWO physical NFC readers OR use simulation mode:

**Option 1: Two physical readers**
```bash
# Find device paths
ls /dev/tty*

# Terminal 1
python tap-broadcaster.py --device tty:USB0:pn532 --lane reader-1

# Terminal 2
python tap-broadcaster.py --device tty:USB1:pn532 --lane reader-2
```

**Option 2: Simulation mode** (recommended for testing)
```bash
# Terminal 1
python tap-broadcaster.py --simulate --lane reader-1

# Terminal 2
python tap-broadcaster.py --simulate --lane reader-2
```

### Environment Variables

Broadcaster can use environment variables:
```bash
export NFC_TAP_SECRET="your-secret-here"
export NEXTJS_URL="http://localhost:3000"
export POS_LANE_ID="reader-1"

python tap-broadcaster.py
```

Or use command-line arguments:
```bash
python tap-broadcaster.py --lane reader-1 --url http://localhost:3000 --secret your-secret
```

## Future Improvements

1. **Add lane status indicator**: Show which lane is currently selected in the UI header
2. **Add lane health monitoring**: Show connection status per lane in settings
3. **Add lane configuration**: Allow custom lane names and descriptions in settings
4. **Add broadcaster discovery**: Automatically detect available lanes/broadcasters
5. **Add lane fallback**: If selected lane disconnects, fall back to default or prompt user
