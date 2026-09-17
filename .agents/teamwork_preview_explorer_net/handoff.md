# Handoff Report: Network Synchronization & Trajectory Interpolation Audit
**Agent**: Network Sync Explorer (`teamwork_preview_explorer_net`)  
**Parent Task ID**: `634d7488-2df3-4eef-b42d-f35a66fcd938`  
**Working Directory**: `/data/data/com.termux/files/home/Projects/HealingNodes/.agents/teamwork_preview_explorer_net/`  
**Date**: 2026-09-17  

---

## 1. Observation

Direct observations from codebase inspection across `server.js`, `src/core/MediaEngine.js`, `src/core/ModeEngine.js`, `public/app.js`, and `src/services/YouTubeProxy.js`:

1. **NTP Clock Sync (`server.js:104–106`, `public/app.js:58–66`)**:
   - `server.js` emits only a single timestamp:
     ```javascript
     104: socket.on('sync_ping', (clientTime) => {
     105:     socket.emit('sync_pong', { clientTime: clientTime, serverTime: Date.now() });
     106: });
     ```
   - In `public/app.js`:
     ```javascript
     58: socket.on('sync_pong', (data) => {
     59:     const latency = (Date.now() - data.clientTime) / 2;
     60:     timeOffsets.push(data.serverTime - data.clientTime - latency);
     61:     if (timeOffsets.length < 10) setTimeout(() => socket.emit('sync_ping', Date.now()), 100);
     62:     else {
     63:         timeOffsets.sort((a,b) => a-b);
     64:         serverTimeOffset = timeOffsets[Math.floor(10/2)];
     65:         document.getElementById('status-text').innerText = "Synchronized. Ready.";
     66:     }
     67: });
     ```
   - `timeOffsets` is global (`let timeOffsets = []`). On reconnect, `socket.on('connect')` fires `socket.emit('sync_ping', Date.now())` without clearing `timeOffsets`. Because `timeOffsets.length >= 10`, `if (timeOffsets.length < 10)` is false, pinging halts after 1 sample, and `serverTimeOffset = timeOffsets[5]` returns a stale sorted value from the previous connection.
   - The offset selection uses a simple median of raw `timeOffsets` without recording or filtering by RTT ($RTT = t_3 - t_0$). Asymmetric Wi-Fi delays directly skew the median.
   - No recurring periodic synchronization exists; clock drift over time (10–100 PPM) is uncorrected.

2. **Trajectory Interpolation & Positioning (`src/core/ModeEngine.js:18, 32–37`, `public/app.js:76–80, 172–177, 269–273`)**:
   - In `src/core/ModeEngine.js`:
     ```javascript
     18: this.duration = durationMs || 1000;
     ```
     `0 || 1000` evaluates to `1000`, preventing instantaneous transitions.
   - In `src/core/ModeEngine.js`:
     ```javascript
     32: let progress = this.duration === 0 ? 1 : (now - this.startTime) / this.duration;
     33: if (progress >= 1) progress = 1;
     34: const eased = progress * progress * (3 - 2 * progress);
     ```
     When `now < this.startTime` (e.g., backward system clock adjustments or NTP step), `progress < 0`. Because there is no lower bound clamp, smoothstep evaluates to values $> 1$ (e.g. $progress = -1 \implies eased = 5$), resulting in extreme polynomial parameter overshoot.
   - In `src/core/ModeEngine.js`:
     ```javascript
     37: this.currentState[key] = this.lerp(this.startState[key], this.targetState[key], eased);
     ```
     `phi_color` ($0–360^\circ$ hue) is linearly interpolated, traversing the long arc (e.g. $15^\circ \to 280^\circ$ travels $265^\circ$ rather than $95^\circ$ through red).
   - In `public/app.js`:
     ```javascript
     265: const time = audioCtx.currentTime;
     269: currentAngleRads = baseNodeAngle + (currentV.orbital_velocity * time);
     ```
     `time` is the local `audioCtx.currentTime` (uptime since local audio started). Nodes joining at different times have different `time` values, rotating out-of-phase.
   - In `public/app.js`:
     ```javascript
     173: const targetFreq = currentV.f_base * currentV.harmonic_ratio;
     175: baseOsc.frequency.setTargetAtTime(targetFreq, t, 2.0);
     ```
     `myIndex` sent by the server in `audio_state_update` is ignored. The harmonic stacking formula $f_{base} \times r_h^{i \bmod 4}$ is not implemented.

3. **Late-Joining Clients & Theater Core Desynchronization (`server.js:93–97`, `src/core/MediaEngine.js:29–45`, `public/app.js:83–95, 208–244`)**:
   - In `server.js`:
     ```javascript
     93: if (role === 'client') {
     94:     nodes.push(socket.id);
     95:     socket.emit('core_switch', { activeCore }); 
     96:     if (activeCore === 'mode') modeEngine.broadcastState();
     97:     else mediaEngine.broadcastState('sync');
     98: }
     ```
   - In `MediaEngine.js`: `broadcastState('sync')` sends `action: 'sync'` to **all** nodes in `nodes`.
   - In `public/app.js`:
     ```javascript
     92: } else if (state.action === 'sync') {
     93:     if (state.url) await loadMediaBuffer(state.url);
     94: }
     ```
     Existing playing nodes re-download and re-decode the buffer mid-playback, causing audio stuttering.
     The late-joining node downloads the buffer and stops; it never plays because `action` was `'sync'` not `'play'`, and the server tracks no playback epoch.
   - In `public/app.js`:
     ```javascript
     211: let tDelta = targetSyncTimeMs - serverTimeOffset - Date.now();
     212: if (tDelta < 0) tDelta = 0; // If late, play immediately
     213: const executionTime = audioCtx.currentTime + (tDelta / 1000);
     ...
     243: mediaSource.start(executionTime);
     ```
     When $tDelta < 0$, it starts playback from offset 0:00 instead of seeking to the elapsed offset ($\text{Math.abs}(tDelta)/1000$). Late devices play seconds behind earlier devices, creating a permanent echo.

4. **Concurrency & Lifecycle Hazards (`server.js:94, 108–114`, `src/core/ModeEngine.js:12`, `src/services/YouTubeProxy.js:13–15`)**:
   - `nodes.push(socket.id)` has no uniqueness check. Reconnecting clients insert duplicate entries, corrupting node count $N$ and angular geometry $(2\pi \cdot i)/N$.
   - `ModeEngine.js:12`: `this.intervalId = setInterval(() => this.tick(), 1000)` has no teardown/clear method, leaking when active core is switched or during testing.
   - `YouTubeProxy.js:13`: Each client spawns an independent `ytdl()` stream to YouTube for the identical URL without abort handling on socket/request close.

---

## 2. Logic Chain

1. **Premise**: Network audio synchronization requires sub-millisecond to low-millisecond timing alignment to avoid comb filtering and echo.
2. **From Observation 1**: The client clock sync uses a median of unweighted offsets without RTT filtering, ignores server turnaround delay ($t_2 - t_1$), does not track drift over time, and fails to clear `timeOffsets` on reconnect.
   - **Inference**: High-jitter packets and crystal drift corrupt the clock offset by tens of milliseconds. Reconnection permanently disables synchronization updates.
3. **From Observation 2**:
   - Smoothstep progress calculation does not clamp `progress >= 0`. Any backward clock step causes polynomial extrapolation with extreme overshoot ($S(-1) = 5$).
   - Angular hue `phi_color` is interpolated linearly across scalars, causing a $265^\circ$ traverse instead of a $95^\circ$ shortest path.
   - Spatial orbital rotation uses un-synchronized local `audioCtx.currentTime`, and `myIndex` is omitted from frequency calculation.
   - **Inference**: Spatial geometry and audio synthesis do not match theoretical design; nodes rotate independently and play in unison rather than forming a spatialized chord.
4. **From Observation 3**:
   - The server maintains no timestamp of when media playback started (`playbackStartTime`).
   - When a client late-joins, the server emits `action: 'sync'` to the entire mesh.
   - Existing clients re-fetch and re-decode the buffer mid-track.
   - Late clients buffer the track and remain silent.
   - If download finishes after `targetSyncTime` ($tDelta < 0$), `mediaSource.start()` is called with offset 0:00.
   - **Inference**: Late-joining devices cannot synchronize to the current playhead; slow-buffering devices permanently desynchronize by seconds; and connecting a new device disrupts existing playback for the entire room.
5. **From Observation 4**:
   - Reconnection duplicates socket IDs in `nodes`, distorting $N$ and resulting in wrong spatial division.
   - Unbounded interval timers and un-aborted YouTube streams create memory and network resource leaks.

---

## 3. Caveats

- **No Caveats.** All relevant files (`server.js`, `src/core/MediaEngine.js`, `src/core/ModeEngine.js`, `public/app.js`, `src/services/YouTubeProxy.js`, documentation blueprints) were audited and verified.

---

## 4. Conclusion

The HealingNodes network synchronization orchestration currently fails under real-world conditions (Wi-Fi jitter, reconnects, late joins, multi-node scaling). 

To achieve production-grade mathematical accuracy and stability:
1. **NTP Protocol**: Implement RFC 5905 two-way timestamps $(t_0, t_1, t_2, t_3)$, a minimum-RTT filter, array clearing on reconnect, and a 20-second recurring sync interval.
2. **Trajectory & Spatial Math**:
   - Clamp smoothstep progress to $[0, 1]$.
   - Allow `durationMs = 0` for instant state jumps.
   - Implement shortest-arc angular interpolation for `phi_color`.
   - Calculate orbital rotation using synchronized network epoch time $(Date.now() + serverTimeOffset)/1000$.
   - Apply node harmonic chord stacking: $f_{base} \times r_h^{myIndex \bmod 4}$.
3. **Late-Join & Playback Scheduling**:
   - Store `playbackStartTime` on the server in `MediaEngine`.
   - Send targeted state sync to joining sockets without re-broadcasting `sync` to existing playing nodes.
   - Seek to current playhead when $tDelta < 0$: `mediaSource.start(audioCtx.currentTime, Math.abs(tDelta)/1000)`.
4. **Concurrency**: Use unique socket tracking (`Set` or array deduplication), provide `destroy()` for `ModeEngine`, and handle stream aborts.

Detailed code architecture specifications and remediation snippets are documented in `network_sync_report.md`.

---

## 5. Verification Method

1. **Static Analysis & Syntax Verification**:
   ```bash
   python ~/.gemini/config/skills/qa-analyzer/scripts/analyzer.py /data/data/com.termux/files/home/Projects/HealingNodes
   ```
2. **Module Execution Check**:
   ```bash
   node -e "require('./src/core/ModeEngine'); require('./src/core/MediaEngine'); console.log('OK');"
   ```
3. **Inspect Detailed Report**:
   Inspect `/data/data/com.termux/files/home/Projects/HealingNodes/.agents/teamwork_preview_explorer_net/network_sync_report.md` for complete mathematical proofs, formulas, and proposed code replacements.
4. **Invalidation Conditions**:
   - If tests show that calling `mediaSource.start(executionTime)` with $tDelta < 0$ can seek to the middle of an audio buffer without passing an explicit `offset` parameter (this is impossible per the W3C Web Audio API specification).
   - If Wi-Fi asymmetric delays do not skew an unweighted median offset filter.
