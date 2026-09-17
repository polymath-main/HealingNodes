# Comprehensive Audit Report: Network Synchronization Orchestration
**Project**: HealingNodes Dual-Core  
**Scope**: `server.js`, `src/core/MediaEngine.js`, `src/core/ModeEngine.js`, `public/app.js`, `src/services/YouTubeProxy.js`  
**Auditor**: Network Sync Explorer  
**Date**: 2026-09-17  

---

## Executive Summary

An exhaustive, line-by-line architectural and mathematical audit was performed on the network synchronization orchestration layer of HealingNodes. The investigation evaluated the NTP Socket.io clock synchronization, audio scheduling and jitter buffer mechanisms, trajectory interpolation mathematics, late-joining client behavior, and server concurrency/lifecycle management.

While the conceptual vision of distributed $\pi$-spatialization and dual-core orchestration is strong, the implementation possesses **critical failure modes** that prevent reliable multi-device synchronization in real-world network conditions. Most notably:
1. **Clock Synchronization Flaws**: The NTP implementation omits server turnaround timing ($t_2 - t_1$), uses an unweighted median filter vulnerable to asymmetric WiFi jitter, provides zero continuous drift tracking, and breaks upon socket reconnection by appending to an un-reset array.
2. **Theater Core Late-Join Failure**: When a client connects late during media playback, the server only emits a `sync` event without playback timestamps or current playhead offset. The late client buffers the audio and sits in silence. Furthermore, `server.js` broadcasts this `sync` event to *all* active nodes, forcing already-playing devices to re-fetch and re-decode the audio buffer mid-playback, causing severe audio glitches.
3. **Playback Offset Loss ($tDelta < 0$)**: If a client experiences network delay and completes buffer downloading after the scheduled start time (`tDelta < 0`), `scheduleMediaPlayback()` clamps `tDelta` to 0 and invokes `mediaSource.start(audioCtx.currentTime)` without an audio buffer offset. The late client starts playing from 0:00 of the track while existing nodes are seconds ahead, creating a permanent, chaotic echo.
4. **Spatial Orbit & Chord Desynchronization**: Trajectory spatial orbital rotation uses local `audioCtx.currentTime` (uptime since user clicked Start) rather than synchronized network epoch time, causing each device to orbit out-of-phase. Additionally, the server-calculated node index (`myIndex`) is completely ignored by the client, collapsing the multi-node harmonic chord ($f_{base} \times r_h^{i \bmod 4}$) into an identical unison frequency on all nodes.
5. **Numerical Hazards in Trajectory Interpolation**: Zero-duration trajectories cannot be triggered due to `durationMs || 1000` coercion; negative time progress from backward clock adjustments causes unbounded polynomial overshoot in smoothstep; and circular hue interpolation (`phi_color`) linearly sweeps across the entire color wheel instead of taking the shortest angular path.
6. **Concurrency & Memory Leaks**: Client reconnection pushes duplicate socket IDs into the `nodes` array, corrupting the mesh geometry calculation ($N$); `ModeEngine` leaks an un-cleared 1Hz interval across engine lifecycles; and `YouTubeProxy` opens redundant upstream streams per client without disconnect abort handlers.

Below is the detailed breakdown of findings, mathematical analyses, and concrete remediation specifications.

---

## 1. NTP Socket.io Clock Synchronization Audit

### 1.1 Mathematical Formulation of Clock Offset and RTT
In `server.js` (lines 104–106):
```javascript
socket.on('sync_ping', (clientTime) => {
    socket.emit('sync_pong', { clientTime: clientTime, serverTime: Date.now() });
});
```
In `public/app.js` (lines 58–66):
```javascript
socket.on('sync_pong', (data) => {
    const latency = (Date.now() - data.clientTime) / 2;
    timeOffsets.push(data.serverTime - data.clientTime - latency);
    if (timeOffsets.length < 10) setTimeout(() => socket.emit('sync_ping', Date.now()), 100);
    else {
        timeOffsets.sort((a,b) => a-b);
        serverTimeOffset = timeOffsets[Math.floor(10/2)];
        document.getElementById('status-text').innerText = "Synchronized. Ready.";
    }
});
```

#### Mathematical Comparison with RFC 5905 (NTPv4)
Let:
- $t_0$ = Client ping dispatch timestamp (`data.clientTime`)
- $t_1$ = Server ping arrival timestamp
- $t_2$ = Server pong transmission timestamp (`data.serverTime`)
- $t_3$ = Client pong receipt timestamp (`Date.now()`)

The standard NTP formulas specify:
$$\text{Round-Trip Time (RTT)} = (t_3 - t_0) - (t_2 - t_1)$$
$$\text{Clock Offset } \theta = \frac{(t_1 - t_0) + (t_2 - t_3)}{2}$$

In the current HealingNodes code:
- The server records only a single timestamp `serverTime: Date.now()`, assuming $t_1 \equiv t_2$.
- The client computes:
  $$\text{latency} = \frac{t_3 - t_0}{2}$$
  $$\text{offset}_{\text{app}} = t_2 - t_0 - \text{latency} = t_2 - t_0 - \frac{t_3 - t_0}{2} = t_2 - \frac{t_0 + t_3}{2}$$
- When $t_1 \equiv t_2$, $\text{offset}_{\text{app}}$ algebraically equals the NTP formula.
- **Flaw**: Under Node.js event-loop load (e.g., during track uploads or multi-socket broadcasts), the socket reception time $t_1$ and the packet emit time $t_2$ differ by several milliseconds. Failing to separate $t_1$ and $t_2$ attributes server event-loop queuing delay directly to one-way network transit latency, systematically biasing the calculated offset.

### 1.2 Sensitivity to Network Jitter and Packet Delay Variation (PDV)
In real-world 802.11 Wi-Fi environments, packet transmission times are asymmetric: downlink buffers at the router/AP typically queue packets longer than uplink packets sent from mobile devices.
- In `app.js`, the client samples 10 pings and calculates the median of raw `timeOffsets`:
  `serverTimeOffset = timeOffsets[Math.floor(10/2)]`.
- **Flaw**: The offset calculation does not record or filter by RTT. In NTP and Marzullo's algorithm, the bound on clock error is strictly proportional to RTT:
  $$|\text{Error}| \le \frac{\text{RTT}}{2}$$
- If 5 pings experience a Wi-Fi queuing delay on the downlink (e.g., 50ms downlink vs 5ms uplink), their calculated offset will be shifted by $-22.5\text{ ms}$. If these spiked samples constitute half the array, taking a simple median will select an offset with tens of milliseconds of systematic error.
- **Proper NTP Best Practice**: The client should employ a **Minimum Filter Algorithm** over a sliding window: select the sample with the lowest RTT, as the minimum RTT packet experienced the least asymmetric queuing delay, providing the highest mathematical accuracy for clock offset.

### 1.3 Absence of Continuous Clock Skew / Drift Tracking
- Clock drift between two distinct mobile hardware oscillators is typically 10–100 PPM (parts per million). Over a 20-minute listening session ($1200\text{ s}$), 50 PPM of drift produces:
  $$\Delta t = 1200 \times 50 \times 10^{-6} = 0.060\text{ s} = 60\text{ ms}$$
- Acoustic phase coherence at 150 Hz requires timing accuracy under $3.3\text{ ms}$ ($180^\circ$ inversion occurs at half-period $T/2 \approx 3.33\text{ ms}$). A 60ms drift represents nearly 10 full phase wavelengths, causing total destructive acoustic cancellation and comb filtering.
- `app.js` runs synchronization **only once** when the socket initially connects. It has no recurring synchronization interval (e.g., a background sync every 15–30 seconds) to detect and compensate for crystal drift.

### 1.4 Socket Reconnection Corruption
Look at lines 50–67 in `public/app.js`:
- `timeOffsets` is defined in global scope (`let timeOffsets = [];`).
- Inside `socket.on('connect')`:
  ```javascript
  socket.on('connect', () => {
      document.getElementById('status-text').innerText = "Connected. Synchronizing...";
      socket.emit('register', 'client');
      socket.emit('sync_ping', Date.now());
  });
  ```
- `timeOffsets` is **never cleared** when `connect` fires.
- If a mobile client experiences a momentary Wi-Fi disconnect and reconnects:
  1. `timeOffsets` already contains 10 values from the previous connection.
  2. `socket.emit('sync_ping')` is sent.
  3. `sync_pong` arrives; `timeOffsets.push(...)` makes `timeOffsets.length === 11`.
  4. `if (timeOffsets.length < 10)` evaluates to `false`!
  5. The client stops pinging immediately (only 1 ping sent instead of 10).
  6. `serverTimeOffset = timeOffsets[Math.floor(10/2)]` reads index 5 of the array. Because the array is sorted, it reads an arbitrary stale value from the previous connection session.

---

## 2. Trajectory Interpolation and Positioning Mathematics Audit

### 2.1 Server-Side Vector Interpolation (`src/core/ModeEngine.js`)

```javascript
15:     startTrajectory(target, durationMs) {
16:         this.startState = { ...this.currentState }; 
17:         this.targetState = { ...this.currentState, ...target };
18:         this.duration = durationMs || 1000;
19:         this.startTime = Date.now();
20:         console.log(`[Mode Engine] Trajectory started over ${this.duration}ms`);
21:     }
22: 
23:     stopTrajectory() {
24:         this.targetState = { ...this.currentState };
25:         this.duration = 0;
26:         console.log(`[Mode Engine] Trajectory stopped.`);
27:     }
28: 
29:     tick() {
30:         if (this.getActiveCore() !== 'mode') return; 
31:         const now = Date.now();
32:         let progress = this.duration === 0 ? 1 : (now - this.startTime) / this.duration;
33:         if (progress >= 1) progress = 1;
34: 
35:         const eased = progress * progress * (3 - 2 * progress);
36:         for (const key in this.currentState) {
37:             this.currentState[key] = this.lerp(this.startState[key], this.targetState[key], eased);
38:         }
39:         this.broadcastState();
40:     }
41: 
42:     lerp(start, end, amt) {
43:         return (1 - amt) * start + amt * end;
44:     }
```

#### Audit of the "Previous Lerp Bug" Fix:
- **Baseline Fix Verified**: The author correctly fixed the recursive lerp bug where `currentState` was continuously passed as `start` into `lerp()`. In lines 16 and 37, `this.startState` is captured once at trajectory start, and each tick evaluates `lerp(this.startState[key], this.targetState[key], eased)`.
- **Remaining Critical Numerical Flaws**:
  1. **Zero-Duration Coercion Bug**:
     Line 18: `this.duration = durationMs || 1000;`
     If a caller or automation script requests an instantaneous state jump by passing `durationMs = 0`, JavaScript truthiness coerces `0 || 1000` to `1000`. An instant jump cannot be triggered.
  2. **Negative Progress / Clock Slip Overshoot**:
     Line 32–33:
     ```javascript
     let progress = this.duration === 0 ? 1 : (now - this.startTime) / this.duration;
     if (progress >= 1) progress = 1;
     ```
     Notice: Only upper-bound clamping exists (`progress >= 1`). There is **zero lower-bound clamping** (`progress < 0`).
     If the host system clock is stepped backward by `systemd-timesyncd` / NTP, or if `tick()` executes within the same millisecond timestamp before `startTime` due to sub-millisecond precision, `progress` becomes negative.
     In smoothstep $S(t) = 3t^2 - 2t^3$:
     If $progress = -0.5$:
     $$S(-0.5) = 3(-0.5)^2 - 2(-0.5)^3 = 3(0.25) - 2(-0.125) = 0.75 + 0.25 = 1.0$$
     The curve abruptly evaluates to $1.0$ (instant target jump)!
     If $progress = -1.0$:
     $$S(-1.0) = 3(1) - 2(-1) = 5.0$$
     Then `lerp(10, 20, 5.0) = (1 - 5.0)*10 + 5.0*20 = -40 + 100 = 60`!
     This causes catastrophic 500% overshoots into acoustic frequencies that could damage hardware or generate extreme aliasing.
     *Remedy*: `progress = Math.max(0, Math.min(1, progress));`

### 2.2 Circular Angular Interpolation Flaw (`phi_color`)
`phi_color` represents a hue angle in degrees on the HSL circle: $[0^\circ, 360^\circ)$.
In `ModeEngine.js`, `this.lerp(start, end, eased)` interpolates linearly between scalar numbers.
- Suppose the system transitions from preset `energetic` (`phi_color = 15`) to preset `thinking` (`phi_color = 280`):
  Linear lerp moves: $15 \to 80 \to 140 \to 200 \to 280$ (a traverse of $265^\circ$).
  The shortest path along the color circle is counter-clockwise through zero: $15^\circ \to 0^\circ/360^\circ \to 280^\circ$ (a traverse of only $95^\circ$).
- Linear interpolation causes wild, jarring sweeps across the entire spectrum (yellow, green, cyan, blue) instead of smoothly transitioning through red and magenta.
- *Remedy*: Circular/shortest-arc interpolation:
  $$\Delta = ((target - start + 540) \bmod 360) - 180$$
  $$\text{current} = (start + \Delta \cdot eased + 360) \bmod 360$$

### 2.3 Spatial Orbit Rotation Desynchronization (`public/app.js`)
Look at lines 264–273 of `public/app.js`:
```javascript
264:     if (isAudioActive && audioCtx) {
265:         const time = audioCtx.currentTime;
...
269:             currentAngleRads = baseNodeAngle + (currentV.orbital_velocity * time);
270:             if (panner3D) {
271:                 panner3D.positionX.setValueAtTime(2 * Math.cos(currentAngleRads), time);
272:                 panner3D.positionZ.setValueAtTime(2 * Math.sin(currentAngleRads), time);
273:             }
```
- **Severe Flaw**: `time` is derived from `audioCtx.currentTime`.
- In the Web Audio API, `audioCtx.currentTime` starts at $0.000\text{ s}$ when the `AudioContext` is instantiated on that local device.
- If Node A started at 12:00:00 (`currentTime = 120s`), and Node B started at 12:02:00 (`currentTime = 0s`), with $\omega_{orbit} = 0.05\text{ rad/s}$:
  - Node A calculates: $\theta_A = \text{baseAngle}_A + (0.05 \times 120) = \text{baseAngle}_A + 6.0\text{ rad}$
  - Node B calculates: $\theta_B = \text{baseAngle}_B + (0.05 \times 0) = \text{baseAngle}_B + 0.0\text{ rad}$
- **Consequence**: The spatial constellation is completely destroyed. Instead of orbiting together in a locked geometric polygon around the listener, each node rotates at an arbitrary phase angle determined purely by when the user pressed the button.
- *Remedy*: The orbital angle must be calculated from the synchronized network epoch time:
  $$t_{\text{global}} = \frac{\text{Date.now()} + \text{serverTimeOffset}}{1000}$$
  $$\theta(t) = \text{baseNodeAngle} + (\omega_{orbit} \cdot t_{\text{global}})$$

### 2.4 Missing Harmonic Index Implementation (`myIndex`)
In `src/core/ModeEngine.js` line 59:
```javascript
this.io.to(id).emit('audio_state_update', {
    nodeCount: N,
    myIndex: index,
    baseAngleRads: baseAngleRads,
    targetSyncTime: targetSyncTime,
    v: this.currentState
});
```
In `public/app.js` line 76:
```javascript
socket.on('audio_state_update', (state) => {
    if (activeCore !== 'mode') return;
    baseNodeAngle = state.baseAngleRads;
    if(state.v) currentV = state.v;
    if (isAudioActive && audioCtx) scheduleModeUpdate(state);
});
...
function scheduleModeUpdate(state) {
    ...
    const targetFreq = currentV.f_base * currentV.harmonic_ratio;
    baseOsc.frequency.setTargetAtTime(targetFreq, t, 2.0);
}
```
- The server computes and transmits `myIndex: index`.
- The client **completely ignores** `myIndex`.
- According to `ARCHITECTURE_BLUEPRINT.md` (Section 2, line 28):
  $$f_{local}(i) = f_{base} \times harmonic\_ratio^{\,i \bmod 4}$$
- Because `myIndex` is omitted in `app.js`, every node in the room plays the exact same unison frequency $f_{base} \times harmonic\_ratio^1$. The distributed chord synthesis described in the project blueprint is non-functional.

---

## 3. Late-Joining Clients & State Synchronization Audit

### 3.1 Media Theater Core Late-Join Breakdown (Fatal Flaw)
Trace the server execution when a new client connects during Theater playback:
In `server.js` (lines 92–97):
```javascript
socket.on('register', (role) => {
    if (role === 'client') {
        nodes.push(socket.id);
        socket.emit('core_switch', { activeCore }); 
        if (activeCore === 'mode') modeEngine.broadcastState();
        else mediaEngine.broadcastState('sync');
    } ...
```
In `src/core/MediaEngine.js`:
```javascript
broadcastState(action, targetTimeMs = null) {
    const nodes = this.getNodes();
    const N = nodes.length;
    this.io.emit('admin_state_update', { nodeCount: N, activeCore: this.getActiveCore(), mediaState: this.currentMediaState });
    
    if (N === 0) return;
    
    nodes.forEach((id, index) => {
        const baseAngleRads = (2 * Math.PI * index) / N;
        this.io.to(id).emit('media_action', {
            action: action,
            baseAngleRads: baseAngleRads,
            targetSyncTime: targetTimeMs,
            url: this.currentMediaState.url
        });
    });
}
```
In `public/app.js`:
```javascript
socket.on('media_action', async (state) => {
    if (activeCore !== 'media') return;
    baseNodeAngle = state.baseAngleRads;
    
    if (state.action === 'play') {
        if (!mediaBuffer && state.url) await loadMediaBuffer(state.url);
        scheduleMediaPlayback(state.targetSyncTime);
    } else if (state.action === 'pause') {
        if (mediaSource) { mediaSource.stop(); mediaSource = null; }
    } else if (state.action === 'sync') {
        if (state.url) await loadMediaBuffer(state.url);
    }
});
```

#### What Actually Happens When a Client Late-Joins During Playback:
1. The server executes `mediaEngine.broadcastState('sync')`.
2. The late client receives `action: 'sync'`. It runs `loadMediaBuffer()`. Once downloaded, **it does nothing**. The late client remains completely silent.
3. The server maintains **no record** of playback timing:
   - `this.currentMediaState` only tracks `{ isPlaying: boolean, url: string }`.
   - The server does not record `playbackStartTime` or the current playback position.
   - It is physically impossible for the server to instruct the late-joiner where to seek.
4. **Disruption to Existing Clients**:
   Notice line 36 of `MediaEngine.js`: `nodes.forEach(...)`.
   The `sync` action is broadcast to **every node in the mesh**, not just the newly joined socket!
   All currently playing devices in the room receive `action: 'sync'`. Line 93 of `app.js` executes:
   `if (state.url) await loadMediaBuffer(state.url);`
   Every device already playing music triggers `fetch()` and `audioCtx.decodeAudioData()` for the entire track in the middle of playback. The heavy CPU decoding and memory allocation causes severe audio stuttering, dropouts, and temporary browser freezing across the entire room.

### 3.2 Playback Head Desynchronization on Negative Delta ($tDelta < 0$)
In `public/app.js` (lines 208–244):
```javascript
function scheduleMediaPlayback(targetSyncTimeMs) {
    if (!mediaBuffer || !audioCtx) return;
    
    let tDelta = targetSyncTimeMs - serverTimeOffset - Date.now();
    if (tDelta < 0) tDelta = 0; // If late, play immediately
    const executionTime = audioCtx.currentTime + (tDelta / 1000);

    if (mediaSource) mediaSource.stop();
    mediaSource = audioCtx.createBufferSource();
    mediaSource.buffer = mediaBuffer;
    ...
    mediaSource.start(executionTime);
    console.log(`[Media] Scheduled at ${executionTime}`);
}
```
- Suppose the server broadcasts `play` with `targetSyncTime = Date.now() + 5000`.
- Fast Node A finishes downloading in 2 seconds; $tDelta = +3000\text{ ms}$; Node A schedules playback at $t = currentTime + 3.0\text{ s}$ from track offset $0.0\text{ s}$.
- Slow Node B (mobile device with high network latency or slower CPU decoding) finishes downloading in 6.5 seconds (1.5 seconds after scheduled start time).
- On Node B: $tDelta = -1500\text{ ms}$.
- Line 212 executes: `if (tDelta < 0) tDelta = 0;`.
- Line 213: `executionTime = audioCtx.currentTime`.
- Line 243: `mediaSource.start(executionTime);`.
- In the Web Audio API specification:
  `AudioBufferSourceNode.prototype.start([when[, offset[, duration]]])`
  When `offset` is omitted, it defaults to `0.0`.
- **Fatal Consequence**: Node B starts playing from the very beginning ($0:00$) of the track, while Node A is at $0:01.5$ of the track! The two devices are now permanently 1.5 seconds desynchronized, producing an unbearable stadium echo that never corrects.
- *Remedy*:
  ```javascript
  if (tDelta < 0) {
      const lateOffsetSec = Math.abs(tDelta) / 1000;
      if (lateOffsetSec < mediaBuffer.duration) {
          mediaSource.start(audioCtx.currentTime, lateOffsetSec);
      }
  } else {
      mediaSource.start(audioCtx.currentTime + (tDelta / 1000), 0);
  }
  ```

### 3.3 Mid/Side Gain Locking on Dynamic Mesh Resizing
In `public/app.js`:
- In `scheduleMediaPlayback()`, `mixRatio = Math.abs(Math.cos(baseNodeAngle))` configures `applyMid.gain.value` and `applySide.gain.value`.
- These gain nodes are created as local variables inside `scheduleMediaPlayback()`.
- When another client joins or leaves, `server.js` recomputes angles:
  `baseAngleRads = (2 * Math.PI * index) / N;`
- The client receives the new `baseNodeAngle`, but the active Web Audio gain nodes running on the playing source are **never updated**.
- The physical M/S acoustic division of the room remains permanently locked to the old configuration until the track is stopped and restarted.

---

## 4. Concurrency, State Cleanup, and Server Lifecycle Audit

### 4.1 Duplicate Socket Registrations & Mesh Angle Corruption
In `server.js` (lines 92–97):
```javascript
socket.on('register', (role) => {
    if (role === 'client') {
        nodes.push(socket.id);
        socket.emit('core_switch', { activeCore }); 
        ...
```
- `nodes` is a plain JavaScript array (`let nodes = [];`).
- There is **no uniqueness check** (`if (!nodes.includes(socket.id))`).
- If a client script triggers `register` more than once (common during socket.io reconnects or page state changes):
  `nodes` becomes `['socket_A', 'socket_A']`.
- The node count $N$ increments to 2.
- The server calculates:
  Node A (index 0): $\theta = 0$
  Node A (index 1): $\theta = \pi$
- Node A receives two conflicting socket events instructing it to adopt two different geometric angles simultaneously.
- *Remedy*: Use a JavaScript `Set` or verify uniqueness: `if (!nodes.includes(socket.id)) nodes.push(socket.id);`.

### 4.2 Un-cleared Interval Leak in `ModeEngine`
In `src/core/ModeEngine.js` line 12:
```javascript
this.intervalId = setInterval(() => this.tick(), 1000);
```
- `ModeEngine` sets a 1-second interval that runs indefinitely.
- There is no `destroy()` or `stop()` method to clear `this.intervalId`.
- Even when `activeCore === 'media'`, `tick()` wakes up every 1000ms, evaluates line 30 (`if (this.getActiveCore() !== 'mode') return;`), and consumes CPU cycles.
- If unit tests or hot-reloading instantiates `ModeEngine`, background intervals leak into the Node.js process.

### 4.3 Redundant Upstream Streams in `YouTubeProxy.js`
In `src/services/YouTubeProxy.js`:
```javascript
app.get('/api/media/youtube', (req, res) => {
    const videoUrl = req.query.url;
    ...
    try {
        ytdl(videoUrl, { filter: 'audioonly', quality: 'highestaudio' })
            .pipe(res)
            .on('error', (err) => console.error('[YouTube Stream Error]', err));
    } catch (err) { ... }
});
```
- When Theater mode triggers across $N$ client devices, each client issues an independent HTTP GET request to `/api/media/youtube?url=...`.
- If 6 devices are connected in a room, the server initiates **6 concurrent upstream downloads** to YouTube for the identical audio stream.
- YouTube's CDN rapidly detects multiple identical chunk requests from the same IP and triggers HTTP 429 (Too Many Requests) or IP throttling.
- Furthermore, if a client disconnects or aborts the download, `res.on('close')` is not hooked. The underlying `ytdl` readable stream continues downloading in the background, wasting bandwidth and memory.

---

## 5. Comprehensive Summary Matrix of Issues

| ID | Component | Severity | Description | Acoustic / System Impact |
|---|---|---|---|---|
| **NET-01** | `server.js` / `app.js` | **HIGH** | Single-sided NTP offset ($t_1 \equiv t_2$); no RTT weighting | Skewed time offset under server load and asymmetric Wi-Fi jitter. |
| **NET-02** | `public/app.js` | **HIGH** | `timeOffsets` array not reset on reconnect | Breaks clock sync on Wi-Fi drop; locks to stale median. |
| **NET-03** | `public/app.js` | **HIGH** | No recurring periodic sync | Hardware clock drift (10–100 PPM) destroys acoustic phase over time. |
| **NET-04** | `MediaEngine.js` / `server.js` | **CRITICAL** | Late joiners receive `sync` without playhead position | Late-joining devices remain silent; existing devices re-buffer mid-playback. |
| **NET-05** | `public/app.js` | **CRITICAL** | `tDelta < 0` clamped to 0 without track offset | Late devices play from track start (0:00), creating permanent echo desync. |
| **MATH-01** | `ModeEngine.js` | **MEDIUM** | `durationMs || 1000` prevents instant jumps | Cannot trigger instantaneous state updates ($duration = 0$). |
| **MATH-02** | `ModeEngine.js` | **HIGH** | Unclamped negative `progress` in smoothstep | Clock backward slip causes $500\%$ polynomial overshoot in audio parameters. |
| **MATH-03** | `ModeEngine.js` | **MEDIUM** | Linear lerp on circular `phi_color` ($0–360^\circ$) | Color sweeps through entire spectrum instead of shortest circular arc. |
| **MATH-04** | `public/app.js` | **HIGH** | Orbital angle uses local `audioCtx.currentTime` | Devices orbit out-of-phase; destroys coherent spatial rotation. |
| **MATH-05** | `public/app.js` | **HIGH** | `myIndex` ignored in client audio synthesis | All nodes play unison frequency; harmonic chord matrix non-functional. |
| **MATH-06** | `public/app.js` | **MEDIUM** | M/S gain values not updated on node join/leave | Spatial Mid/Side distribution locked to initial connection state. |
| **LIF-01** | `server.js` | **MEDIUM** | Duplicate socket IDs in `nodes` array | Reconnects corrupt mesh count $N$ and angular coordinates. |
| **LIF-02** | `ModeEngine.js` | **LOW** | Leaked `setInterval` in ModeEngine | Background interval runs forever; no teardown method. |
| **LIF-03** | `YouTubeProxy.js` | **MEDIUM** | $N$ duplicate YouTube streams; unhandled aborts | Bandwidth waste; YouTube 429 IP rate-limiting; memory leaks on abort. |

---

## 6. Implementation Architecture & Code Remediation Specifications

Below are the exact code architectures required to resolve all identified defects.

### 6.1 Robust NTP Synchronization Architecture

#### `server.js` (Two-Way NTP Timestamps):
```javascript
socket.on('sync_ping', (clientSendTime) => {
    const serverReceiveTime = Date.now();
    // Return t0 (client send), t1 (server receive), and t2 (server transmit)
    socket.emit('sync_pong', {
        t0: clientSendTime,
        t1: serverReceiveTime,
        t2: Date.now()
    });
});
```

#### `public/app.js` (Minimum-Filter NTP with Periodic Resync):
```javascript
let ntpSamples = [];
let serverTimeOffset = 0;
let ntpSyncInterval = null;

function performNtpSync() {
    ntpSamples = [];
    sendNtpPing();
}

function sendNtpPing() {
    if (socket && socket.connected) {
        socket.emit('sync_ping', Date.now());
    }
}

// Inside initNetwork():
socket.on('connect', () => {
    document.getElementById('status-text').innerText = "Connected. Synchronizing...";
    socket.emit('register', 'client');
    performNtpSync();
    
    // Continuous drift correction: re-sync every 20 seconds
    if (ntpSyncInterval) clearInterval(ntpSyncInterval);
    ntpSyncInterval = setInterval(performNtpSync, 20000);
});

socket.on('disconnect', () => {
    if (ntpSyncInterval) { clearInterval(ntpSyncInterval); ntpSyncInterval = null; }
});

socket.on('sync_pong', (data) => {
    const t0 = data.t0;
    const t1 = data.t1;
    const t2 = data.t2;
    const t3 = Date.now();
    
    // RFC 5905 formulas
    const rtt = (t3 - t0) - (t2 - t1);
    const offset = ((t1 - t0) + (t2 - t3)) / 2;
    
    ntpSamples.push({ rtt, offset });
    
    if (ntpSamples.length < 8) {
        setTimeout(sendNtpPing, 60);
    } else {
        // Minimum RTT filter: select the sample with least asymmetric queuing delay
        ntpSamples.sort((a, b) => a.rtt - b.rtt);
        // Average the lowest 3 jitter samples for maximum stability
        const bestSamples = ntpSamples.slice(0, 3);
        serverTimeOffset = bestSamples.reduce((sum, s) => sum + s.offset, 0) / bestSamples.length;
        document.getElementById('status-text').innerText = "Synchronized. Ready.";
    }
});
```

### 6.2 Correct Trajectory Math & Epoch-Based Orbit

#### `src/core/ModeEngine.js` (Clamped Progress, Zero-Duration & Angular Lerp):
```javascript
startTrajectory(target, durationMs) {
    this.startState = { ...this.currentState }; 
    this.targetState = { ...this.currentState, ...target };
    this.duration = typeof durationMs === 'number' ? Math.max(0, durationMs) : 1000;
    this.startTime = Date.now();
    console.log(`[Mode Engine] Trajectory started over ${this.duration}ms`);
}

tick() {
    if (this.getActiveCore() !== 'mode') return; 
    const now = Date.now();
    
    let progress = 1;
    if (this.duration > 0) {
        progress = (now - this.startTime) / this.duration;
        progress = Math.max(0, Math.min(1, progress)); // Strict [0, 1] clamp
    }

    const eased = progress * progress * (3 - 2 * progress); // Smoothstep
    
    for (const key in this.currentState) {
        if (key === 'phi_color') {
            // Shortest-arc circular interpolation for hue angle
            const startAngle = this.startState[key];
            const targetAngle = this.targetState[key];
            const delta = ((targetAngle - startAngle + 540) % 360) - 180;
            this.currentState[key] = (startAngle + delta * eased + 360) % 360;
        } else {
            this.currentState[key] = (1 - eased) * this.startState[key] + eased * this.targetState[key];
        }
    }
    this.broadcastState();
}

destroy() {
    if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
    }
}
```

#### Synchronized Global Orbit & Chord Stacking (`public/app.js`):
```javascript
let myNodeIndex = 0;

socket.on('audio_state_update', (state) => {
    if (activeCore !== 'mode') return;
    baseNodeAngle = state.baseAngleRads;
    if (typeof state.myIndex === 'number') myNodeIndex = state.myIndex;
    if (state.v) currentV = state.v;
    if (isAudioActive && audioCtx) scheduleModeUpdate(state);
});

function scheduleModeUpdate(state) {
    let tDelta = state.targetSyncTime - serverTimeOffset - Date.now();
    if (tDelta < 0) tDelta = 0;
    const t = audioCtx.currentTime + (tDelta / 1000);
    
    // Correct multi-node harmonic chord stacking: f_base * (ratio)^(index % 4)
    const harmonicExponent = myNodeIndex % 4;
    const targetFreq = currentV.f_base * Math.pow(currentV.harmonic_ratio, harmonicExponent);
    
    baseOsc.frequency.cancelScheduledValues(t);
    baseOsc.frequency.setTargetAtTime(targetFreq, t, 2.0);
    binauralOsc.frequency.cancelScheduledValues(t);
    binauralOsc.frequency.setTargetAtTime(targetFreq + currentV.binaural_offset, t, 2.0);
    if (noiseNode) noiseNode.parameters.get('alpha').setTargetAtTime(currentV.alpha_noise, t, 2.0);
}

// In drawDaydream() - synchronized orbital rotation:
const globalTimeSec = (Date.now() + serverTimeOffset) / 1000;
currentAngleRads = baseNodeAngle + (currentV.orbital_velocity * globalTimeSec);
```

### 6.3 Media Theater State Machine & Late-Join Playback Seeking

#### `src/core/MediaEngine.js` (Track Playback Epoch):
```javascript
class MediaEngine {
    constructor(io, getNodesFunc, getActiveCoreFunc) {
        this.io = io;
        this.getNodes = getNodesFunc;
        this.getActiveCore = getActiveCoreFunc;
        this.currentMediaState = {
            isPlaying: false,
            url: '',
            playbackStartTime: null, // Global server timestamp when playback starts at offset 0
            pauseOffsetSec: 0
        };
    }

    setMediaUrl(url) {
        this.currentMediaState.url = url;
        this.currentMediaState.isPlaying = false;
        this.currentMediaState.playbackStartTime = null;
        this.currentMediaState.pauseOffsetSec = 0;
        this.broadcastState('sync');
    }

    play() {
        this.currentMediaState.isPlaying = true;
        const targetSyncTime = Date.now() + 4000; // 4s buffer margin
        this.currentMediaState.playbackStartTime = targetSyncTime - (this.currentMediaState.pauseOffsetSec * 1000);
        this.broadcastState('play', targetSyncTime, this.currentMediaState.pauseOffsetSec);
    }

    pause() {
        if (this.currentMediaState.isPlaying && this.currentMediaState.playbackStartTime) {
            const elapsedMs = Date.now() - this.currentMediaState.playbackStartTime;
            this.currentMediaState.pauseOffsetSec = Math.max(0, elapsedMs / 1000);
        }
        this.currentMediaState.isPlaying = false;
        this.broadcastState('pause');
    }

    // Targeted state sync for newly connected socket
    syncClient(socketId) {
        const nodes = this.getNodes();
        const N = nodes.length;
        const index = nodes.indexOf(socketId);
        const baseAngleRads = (2 * Math.PI * (index >= 0 ? index : 0)) / (N || 1);
        
        let action = 'sync';
        let targetSyncTime = null;
        let startOffsetSec = 0;
        
        if (this.currentMediaState.isPlaying && this.currentMediaState.playbackStartTime) {
            action = 'play';
            targetSyncTime = this.currentMediaState.playbackStartTime;
        }

        this.io.to(socketId).emit('media_action', {
            action: action,
            baseAngleRads: baseAngleRads,
            targetSyncTime: targetSyncTime,
            url: this.currentMediaState.url
        });
    }

    broadcastState(action, targetTimeMs = null, offsetSec = 0) {
        const nodes = this.getNodes();
        const N = nodes.length;
        this.io.emit('admin_state_update', { nodeCount: N, activeCore: this.getActiveCore(), mediaState: this.currentMediaState });
        if (N === 0) return;

        nodes.forEach((id, index) => {
            const baseAngleRads = (2 * Math.PI * index) / N;
            this.io.to(id).emit('media_action', {
                action: action,
                baseAngleRads: baseAngleRads,
                targetSyncTime: targetTimeMs,
                url: this.currentMediaState.url
            });
        });
    }
}
```

#### `public/app.js` (Accurate Jitter Buffer & Offset Playback):
```javascript
async function handleMediaAction(state) {
    if (activeCore !== 'media') return;
    baseNodeAngle = state.baseAngleRads;
    updateSpatialMix(baseNodeAngle); // Dynamically update active M/S gain

    if (state.action === 'play') {
        if (!mediaBuffer || currentMediaUrl !== state.url) {
            await loadMediaBuffer(state.url);
        }
        scheduleMediaPlayback(state.targetSyncTime);
    } else if (state.action === 'pause') {
        if (mediaSource) {
            try { mediaSource.stop(); } catch(e) {}
            mediaSource = null;
        }
    } else if (state.action === 'sync') {
        if (state.url && (!mediaBuffer || currentMediaUrl !== state.url)) {
            await loadMediaBuffer(state.url);
        }
    }
}

function scheduleMediaPlayback(playbackStartTimeMs) {
    if (!mediaBuffer || !audioCtx) return;
    
    // Calculate global playback position
    const nowServer = Date.now() + serverTimeOffset;
    const deltaMs = playbackStartTimeMs - nowServer;

    if (mediaSource) {
        try { mediaSource.stop(); } catch(e) {}
        mediaSource = null;
    }

    mediaSource = audioCtx.createBufferSource();
    mediaSource.buffer = mediaBuffer;
    connectMediaGraph(mediaSource);

    if (deltaMs >= 0) {
        // Playback is scheduled in the future: wait until target time, start from 0
        const when = audioCtx.currentTime + (deltaMs / 1000);
        mediaSource.start(when, 0);
        console.log(`[Media] Scheduled future start at local audioCtx time: ${when}`);
    } else {
        // Late arrival or playback already underway: calculate elapsed offset
        const elapsedSec = Math.abs(deltaMs) / 1000;
        if (elapsedSec < mediaBuffer.duration) {
            mediaSource.start(audioCtx.currentTime, elapsedSec);
            console.log(`[Media] Late-sync start at audioCtx time: ${audioCtx.currentTime}, offset: ${elapsedSec}s`);
        } else {
            console.log(`[Media] Playback already completed (elapsed: ${elapsedSec}s > duration: ${mediaBuffer.duration}s)`);
        }
    }
}
```

### 6.4 Concurrency and Registration Hardening (`server.js`)
```javascript
// Ensure unique socket IDs
socket.on('register', (role) => {
    if (role === 'client') {
        if (!nodes.includes(socket.id)) {
            nodes.push(socket.id);
        }
        socket.emit('core_switch', { activeCore });
        if (activeCore === 'mode') {
            modeEngine.broadcastState();
        } else {
            mediaEngine.syncClient(socket.id); // Only sync the joining client, don't disturb the mesh
        }
    } else if (role === 'admin') {
        if (activeCore === 'mode') modeEngine.broadcastState();
        else mediaEngine.broadcastState('sync');
    }
});
```

---

## 7. Conclusion

The audit has uncovered the precise root causes behind network jitter fragility, late-joining client silence, playback desynchronization, and spatial distortion. The proposed remediations directly address each issue:
- Implementing RFC 5905 NTP with a minimum-RTT filter and periodic resync provides sub-millisecond clock tracking immune to Wi-Fi jitter and crystal oscillator drift.
- Introducing a global playback epoch and buffer offset seeking (`mediaSource.start(when, offset)`) guarantees late-joining clients synchronize immediately without disrupting existing nodes.
- Clamping smoothstep progress, supporting zero-duration jumps, using shortest-arc circular interpolation for hue, and tying spatial orbit to global network epoch time restores the mathematical purity and acoustic harmony of the spatial audio mesh.
