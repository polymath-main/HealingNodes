# Specification & QA Mining Report: HealingNodes Dual-Core Architecture

**Generated Date**: 2026-09-17T21:05:00Z  
**Agent**: Specification Miner (QA & Spec Discovery)  
**Workspace**: `/data/data/com.termux/files/home/Projects/HealingNodes`  
**Parent Conversation ID**: `634d7488-2df3-4eef-b42d-f35a66fcd938`  

---

## 1. Executive Summary & QA Status

A comprehensive structural, DSP, network synchronization, and QA survey of the HealingNodes Dual-Core project was conducted.

### 1.1 Universal Offline QA Analyzer Run
The universal Python offline static analyzer (`~/.gemini/config/skills/qa-analyzer/scripts/analyzer.py`) was executed against the root directory:
```bash
python ~/.gemini/config/skills/qa-analyzer/scripts/analyzer.py .
```
- **Exit Code**: `0`
- **Result**: `✅ UNIVERSAL QA PASS: Structural integrity and syntax verified.`
- **Observations**: Zero unmatched brackets, braces, parentheses, or unclosed string literals exist across all JavaScript, HTML, and CSS source files.

### 1.2 Health & Audit Assessment
While structural syntax passes cleanly, the architectural and mathematical audit revealed **9 critical functional, acoustic, and synchronization defects** that must be addressed to fulfill requirements R1 and R2 of `ORIGINAL_REQUEST.md`:
1. Mid/Side acoustic matrix flaw in `public/app.js` (identical $+Side$ polarity applied to both left and right perimeter nodes; dialogue blasted directly at rear $\theta = \pi$).
2. Crossover implementation flaw (uses `allpass` instead of Butterworth `highpass` at 40Hz on desktop/TV; completely omitted in `initModeEngine()`).
3. Dynamics limiter omission in `initModeEngine()` (phone/desktop speakers vulnerable to digital clipping or voice coil damage from raw 33Hz + noise).
4. Audio signal graph routing discrepancies in `initModeEngine()` (`baseOsc` routed to Left channel of `ChannelMergerNode` instead of `PannerNode`; missing 2kHz lowpass filter and 0.55 noise gain; missing per-node harmonic exponent $r_h^{i \bmod 4}$).
5. Missing REST endpoint `GET /api/state` in `server.js` (specified in `ARCHITECTURE_BLUEPRINT.md` and required by admin console).
6. Missing Circadian Scheduling logic (`node-cron` package is installed in `package.json` but completely omitted in `server.js` and `ModeEngine.js`).
7. Media sync flaw for late-joining clients in `MediaEngine.js` (broadcasts `'sync'` rather than active playback state and timestamp offset; zero playback position tracking).
8. Cumulative AudioNode leak and potential crash on uninitialized `theaterDest` in `app.js` `scheduleMediaPlayback`.
9. Global `timeOffsets` array in `public/app.js` never cleared upon socket reconnects, contaminating NTP calculations with stale latency samples.

---

## 2. Repository and Dependency Survey

### 2.1 Package Manifest (`package.json`)
- **Name**: `healingnodes`
- **Version**: `1.0.0`
- **Module Type**: `commonjs`
- **Main**: `index.js` (Note: `server.js` is the actual entrypoint; `index.js` does not exist)
- **Current Scripts**:
  - `"start": "node server.js"`
  - `"test": "echo \"Error: no test specified\" && exit 1"` *(No test suite is currently configured)*
- **Runtime Dependencies**:
  - `express`: `^5.2.1`
  - `multer`: `^2.4.0`
  - `node-cron`: `^4.6.0`
  - `socket.io`: `^4.8.3`
  - `ws`: `^8.21.3`
  - `ytdl-core`: `^4.11.5`
- **Node Runtime**: `v24.18.0` on Linux (`aarch64` Android Termux / Bionic libc). Built-in `node:test` and `node:assert` are fully supported without additional external packages.

### 2.2 Git Status and Recent Commit Log
- **Git Status**: On branch `main`, working tree clean (untracked `.agents/` directory and `ORIGINAL_REQUEST.md`).
- **Recent Git Log (Top 5 Commits)**:
  1. `1092640` - *feat: Microservices architecture, YouTube ytdl-core proxy, and Autoplay UI fix*
  2. `e322f94` - *feat: Implemented Dual-Core Architecture (Mode Engine + Media Theater) with M/S Phase Extraction and Hardware Excursion Safety Limiters*
  3. `faedb51` - *Fix: correct all audio graph, lerp, visual, noise, binaural, and preset defects*
  4. `a05a906` - *Fix: Restored requestWakeLock and graceful AudioWorklet failure handling*
  5. `c351d6d` - *Fix: Added TV/Older browser compatibility for WebAudio Worklets*

### 2.3 Directory and Source File Map
```
/data/data/com.termux/files/home/Projects/HealingNodes/
├── ARCHITECTURE_BLUEPRINT.md       # Architectural specifications & signal flow
├── ORIGINAL_REQUEST.md             # Project requirements (R1 Web Audio DSP, R2 Net Sync)
├── PHASE2_IMPLEMENTATION_PLAN.md   # Mathematical equations, lerp proof, presets, API
├── PHASE3_THEATER_ARCHITECTURE.md  # Decentralized spatial theater, M/S, limiters, NTP
├── README.md                       # Overview & Quickstart instructions
├── THEORY.md                       # Biophysical resonance & Quadtree spatial theory
├── package.json                    # Dependencies & scripts
├── package-lock.json               # Locked dependency tree
├── server.js                       # Express + Socket.io Orchestrator server
├── src/
│   ├── core/
│   │   ├── MediaEngine.js          # Core 2: Spatial Media Theater controller
│   │   └── ModeEngine.js           # Core 1: Emotional Trajectory & vector interpolation
│   └── services/
│       └── YouTubeProxy.js         # ytdl-core streaming audio proxy service
└── public/
    ├── admin.html                  # Conductor / Admin dashboard UI
    ├── app.js                      # Client-side Web Audio synthesis, M/S matrix, visuals
    ├── index.html                  # Client node viewer UI & Autoplay unlock overlay
    ├── js/                         # Empty directory (reserved for scripts)
    └── media/                      # Uploaded theater tracks (created on demand)
```

---

## 3. Specifications & System Architecture Mapping

### 3.1 Mathematical Theory (`THEORY.md`)
- **Spatial Triangulation**: $\theta_i = \frac{2\pi \cdot i}{N}$ for $N$ connected nodes uniformly distributes wavefronts around the geometric center (the listener).
- **Acoustic Anchor (33 Hz)**: Resonant root harmonic of architectural space ($\lambda \approx 10.4\text{ m}$), targeting vagus nerve stimulation and low-gamma binding.
- **Organic Spectral Entropy ($1/f$)**: Voss-McCartney pink noise simulating natural acoustic baselines to support parasympathetic regulation.

### 3.2 Mode Engine Architecture (Core 1)
- **Environmental State Vector $V$**:
  $$V = [f_{base},\, T_{breath},\, \alpha_{noise},\, \phi_{color},\, harmonic\_ratio,\, \omega_{orbit},\, \Delta f_{binaural}]$$
- **Continuous Trajectory Interpolation**:
  - Smoothstep easing: $S(t) = 3t^2 - 2t^3$ where $t = \text{clamp}\left(\frac{\Delta t}{D}, 0, 1\right)$.
  - Interpolation: $V_k(t) = (1 - S(t)) \cdot V_{k,\text{start}} + S(t) \cdot V_{k,\text{target}}$.
  - Freeze snapshot: `startState` must be snapshotted once at initiation to guarantee clean convergence without exponential creep.
- **Orbital Spatial Panning**:
  $$\theta(t) = \theta_i + \omega_{orbit} \cdot t_{audio}, \quad x = r \cos(\theta(t)), \quad z = r \sin(\theta(t))$$
- **Breathing LFO**:
  $$\omega_{breath} = \frac{2\pi}{T_{breath}}, \quad g_{breath}(t) = 0.75 + 0.25 \cdot \left(\frac{\sin(\omega_{breath} t) + 1}{2}\right)$$
- **Visual Engine Sub-Harmonics & HSL**:
  - Aliasing mitigation: $f_{visual} = f_{base} / 300 \approx 0.11\text{ Hz}$ at 33 Hz.
  - HSL angle mapping: $\text{hue} = \phi_{color} + \frac{180}{\pi} \theta(t) \cdot 0.3 \pmod{360}$.

### 3.3 Media Theater Architecture (Core 2)
- **Hardware Profiling Crossover**:
  - Mobile phones ($< 768\text{px}$): Highpass Butterworth filter at 150 Hz ($Q = 0.707$) to protect micro-transducers.
  - TV / Desktop / Subwoofer: Highpass Butterworth filter at 40 Hz ($Q = 0.707$) to eliminate infrasonic DC rumble and protect desktop speaker voice coils.
- **Brickwall Limiter**:
  - `DynamicsCompressorNode` with `threshold = -1.0 dBFS`, `knee = 0.0 dB`, `ratio = 20.0`, `attack = 0.002s`, `release = 0.100s`.
- **Mid/Side Acoustic Field Matrix**:
  - $Mid = \frac{L + R}{2}$ (dialogue, lead vocals, kick drums).
  - $Side = \frac{L - R}{2}$ (wide spatial reverb, stereo ambient field).
  - Spatial routing: Front center ($\theta = 0$) outputs Mid; lateral positions ($\theta = \pi/2$ and $3\pi/2$) cancel Mid dialogue and deliver Side stereo expansion.

---

## 4. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Mode Engine | State Broadcast | Emits real-time state deltas to admin and audio nodes | Connected socket IDs, `currentState` | `admin_state_update`, `audio_state_update` | If `nodes.length === 0`, skips audio emit | `src/core/ModeEngine.js` |
| 2 | Mode Engine | Trajectory Morph | Smoothly transitions 7D vector over duration $D$ | `targetState`, `durationMs` | Interpolated vector $V$ per second | If `durationMs <= 0`, defaults to 1000ms | `src/core/ModeEngine.js` |
| 3 | Mode Engine | Trajectory Halt | Freezes interpolation at current position | None (API call) | Target becomes current state, duration=0 | Silent success | `src/core/ModeEngine.js` |
| 4 | Media Engine | Media URL Setup | Sets active track and triggers mesh sync | URL string (`/media/...` or proxy) | `media_action` (`sync`) | If no nodes, stores URL only | `src/core/MediaEngine.js` |
| 5 | Media Engine | Global Play Sync | Broadcasts playback command with future timestamp | None (API call) | `media_action` (`play`, `Date.now() + 5000`) | Silently proceeds even if buffer not ready | `src/core/MediaEngine.js` |
| 6 | Media Engine | Global Pause | Broadcasts immediate stop command | None (API call) | `media_action` (`pause`) | Sets `isPlaying = false` | `src/core/MediaEngine.js` |
| 7 | Core Orchestration | Core Switch | Toggles between Mode Engine and Media Theater | `core: 'mode' \| 'media'` | `core_switch` event, immediate state broadcast | Does not validate core string value | `server.js` |
| 8 | Network Sync | NTP Clock Offset | 10-ping median filter to compute server clock offset | `Date.now()` client ping | `sync_pong`, calculates median offset | Outliers rejected by median; reconnect leaks | `public/app.js` |
| 9 | Network Sync | Scheduled Lookahead | Applies parameter changes at calculated future audio time | `targetSyncTime`, `serverTimeOffset` | Local `AudioContext.currentTime` parameter targets | Negative delta clamps to 0 (immediate) | `public/app.js` |
| 10 | DSP (Mode) | Voss-McCartney Noise | Generates pink/brown noise via AudioWorklet | `alpha_noise` parameter (0–3) | Continuous audio buffer output | Falls back to `null` if worklet fails | `public/app.js` |
| 11 | DSP (Mode) | Binaural Beats | Generates interaural frequency difference | `f_base`, `harmonic_ratio`, `binaural_offset` | Discrete L/R audio streams via `ChannelMerger` | Hard-panned even if `offset === 0` | `public/app.js` |
| 12 | DSP (Media) | M/S Extraction Matrix | Computes $(L+R)/2$ and $(L-R)/2$ for spatial division | Stereo audio buffer | Mono output routed to crossover | Re-connects new nodes without clearing old | `public/app.js` |
| 13 | DSP (Media) | Hardware Crossover | Filters frequencies based on device profile | `isPhone = innerWidth < 768` | BiquadFilter (150Hz HP or allpass) | Non-phones get allpass instead of 40Hz HP | `public/app.js` |
| 14 | DSP (Media) | Brickwall Limiter | Clamps dynamic peaks to prevent clipping/damage | Audio signal post-crossover | AudioContext destination | Only applied in Media Core, not Mode Core | `public/app.js` |
| 15 | Media Service | YouTube Audio Proxy | Streams raw audio stream from YouTube URL | `?url=<youtube_url>` | `audio/webm` HTTP stream | Logs error to stderr, returns 500 if unhandled | `src/services/YouTubeProxy.js` |
| 16 | Admin UI | Preset Selection | Triggers 1 of 5 predefined emotional trajectories | Preset click (e.g. `focused`, `hybrid`) | POST `/api/trajectory/start` | Presets defined in HTML, not synced from server | `public/admin.html` |
| 17 | Admin UI | Local File Upload | Uploads MP3 to `/public/media/theater_track.mp3` | `multipart/form-data` MP3 | POST `/api/media/upload` | Overwrites existing `theater_track.mp3` | `server.js`, `admin.html` |
| 18 | Client Visual | Liquid Visual Canvas | Renders audio-synchronized visual waveforms | Audio clock, `phi_color`, breath LFO | 60fps canvas animation | Double click toggles fullscreen | `public/app.js` |

---

## 5. Edge Cases & Observed Behavior

| # | Feature | Input / Condition | Observed Behavior | Defect / Impact |
|---|---------|-------------------|-------------------|-----------------|
| 1 | M/S Matrix | Hard-right audio ($L=0, R=1$) at side nodes ($90^\circ$ and $270^\circ$) | Both left ($270^\circ$) and right ($90^\circ$) nodes output $-0.50$ in phase | Destroys acoustic stereo field; right-panned audio is heard identically on both sides |
| 2 | M/S Matrix | Center dialogue ($L=1, R=1$) at rear node ($\theta = 180^\circ$) | Node outputs $1.00$ (full Mid dialogue) directly behind listener | Violates theater acoustics; rear speakers should receive ambient Side reverb, not direct dialogue |
| 3 | Crossover | TV / Desktop node (`innerWidth >= 768`) in Media Core | Crossover filter type is set to `"allpass"` at default 350Hz | Fails to filter sub-40Hz DC rumble; introduces phase distortion at 350Hz |
| 4 | Crossover & Limiter | Phone connected to Mode Core (`activeCore = 'mode'`) | Mode Core bypasses crossover and limiter entirely; sends 33Hz directly to destination | Can distort or damage phone micro-speakers incapable of 33Hz reproduction |
| 5 | Mode Audio Graph | `binaural_offset = 0` | Binaural oscillator remains active at full 0.8 gain in Right channel | Interferes with base oscillator; prevents pure mono/spatial base tone |
| 6 | Mode Audio Graph | Multiple nodes connect ($N \ge 2$) | All nodes compute `currentV.f_base * currentV.harmonic_ratio` identically | Node index `myIndex` is ignored; harmonic octave stacking ($r_h^{i \bmod 4}$) is lost |
| 7 | Media Sync | New node joins while media is actively playing | Server emits `'sync'`, node downloads buffer but never receives play command or seek offset | Late-joining node remains completely silent while other nodes play |
| 8 | Media Sync | Multiple clicks on Admin "PLAY" | `scheduleMediaPlayback` runs repeatedly, instantiating and connecting new gain nodes without disconnecting prior ones | Memory leak and audio gain accumulation |
| 9 | NTP Sync | Socket disconnects and reconnects | `timeOffsets` array retains previous 10 values without reset; appends 11th | Stale time offset samples pollute median latency calculation |
| 10 | Mode Trajectory | `startTrajectory(target, 0)` | Duration evaluated as `durationMs || 1000`, resulting in 1000ms instead of instantaneous morph | Fails to apply instant parameter jumps |
| 11 | REST API | `GET /api/state` | Route not defined in `server.js` | Returns 404 Cannot GET /api/state; violates blueprint spec |
| 12 | Circadian Schedule | Background hourly automation | `node-cron` package is installed but never required or executed | Zero automated circadian transitions occur |

---

## 6. Deep-Dive Code & Physical Math Defect Findings

### Defect 1: Mid/Side Acoustic Matrix Flaw in `public/app.js`
- **Location**: `public/app.js:232-239`
- **Current Code**:
  ```javascript
  const mixRatio = Math.abs(Math.cos(baseNodeAngle)); // 0 rad = 1 (Mid). PI/2 rad = 0 (Side)
  const applyMid = audioCtx.createGain(); applyMid.gain.value = mixRatio;
  const applySide = audioCtx.createGain(); applySide.gain.value = 1.0 - mixRatio;
  ```
- **Physical Defect**:
  1. In acoustic Mid/Side decoding, the soundfield equation is:
     $$\text{Left} = Mid + Side = \frac{L+R}{2} + \frac{L-R}{2}$$
     $$\text{Right} = Mid - Side = \frac{L+R}{2} - \frac{L-R}{2}$$
     A node positioned on the right perimeter ($\theta \in (0, \pi)$, specifically $\theta = \pi/2$) requires **inverted Side polarity** ($-Side = \frac{R-L}{2}$) relative to the left perimeter ($\theta \in (\pi, 2\pi)$, specifically $\theta = 3\pi/2$). In `app.js`, both sides receive $+Side$, destroying the acoustic dipole.
  2. Because $\text{mixRatio} = |\cos(\theta)|$, when $\theta = \pi$ (rear center), $|\cos(\pi)| = 1.0$, which routes 100% Mid (dialogue) to the rear. In spatial theater, dialogue belongs only in front ($\theta \approx 0$).

### Defect 2: Crossover Filter Deviation in `public/app.js`
- **Location**: `public/app.js:186-193`
- **Current Code**:
  ```javascript
  if (isPhone) {
      crossover.type = "highpass";
      crossover.frequency.value = 150;
      crossover.Q.value = 0.707;
  } else {
      crossover.type = "allpass";
  }
  ```
- **Blueprint Spec** (`PHASE3_THEATER_ARCHITECTURE.md:15-22`):
  Non-phones must use a `highpass` filter at `40Hz` with $Q = 0.707$ (Butterworth response) to block sub-audible excursion damage. Using `allpass` at default frequency introduces unwanted phase shift and provides zero cone protection.

### Defect 3: Limiter and Crossover Missing in Mode Engine
- **Location**: `public/app.js:136-167`
- **Current Code**: `masterGain.connect(audioCtx.destination);` directly.
- **Blueprint Spec** (`PHASE3_THEATER_ARCHITECTURE.md:10`):
  "Every node will now pass through a Hardware Profiling Crossover and a Brickwall Limiter before reaching `audioCtx.destination`." Mode Engine generates high-energy 33Hz sines that endanger phone speakers if not protected by the 150Hz crossover and limiter.

### Defect 4: Signal Graph Discrepancies in `initModeEngine()`
- **Location**: `public/app.js:143-156`
- **Discrepancies**:
  1. `baseOscGain` is connected exclusively to `merger, 0, 0` (hard-panned left). It does NOT connect to `panner3D`.
  2. `panner3D` only receives `noiseNode`.
  3. `breathingFilter` (a GainNode) sits between `noiseNode` and `panner3D`. Per `ARCHITECTURE_BLUEPRINT.md:14-19`, `breathGain` should sit after `panner3D` to modulate the entire spatialized field.
  4. Missing `noiseFilter` (lowpass 2kHz) and `noiseGain` (0.55).
  5. Per-node frequency multiplier ($f_{local}(i) = f_{base} \cdot r_h^{i \bmod 4}$) is omitted in `scheduleModeUpdate()`; all nodes play identical frequencies.

### Defect 5: Missing `GET /api/state` Endpoint
- **Location**: `server.js`
- **Specification**: `ARCHITECTURE_BLUEPRINT.md:120`, `PHASE2_IMPLEMENTATION_PLAN.md:254`
- **Impact**: Clients or management tools cannot query the current 7D vector, node count, and active core via HTTP.

### Defect 6: Missing Circadian Scheduler
- **Location**: `server.js`
- **Specification**: `ARCHITECTURE_BLUEPRINT.md:133-143`, `PHASE2_IMPLEMENTATION_PLAN.md:260-271`
- **Impact**: The 6 daily circadian presets (Dawn Wake at 06:00, Flow State at 09:00, Homeostasis at 13:00, Late Creative at 17:00, Evening Wind-Down at 21:00, Sleep Onset at 23:00) are never initiated.

### Defect 7: Late-Joining Media Sync & Position Tracking
- **Location**: `src/core/MediaEngine.js:29-45`, `server.js:93-97`
- **Impact**: When a new node connects during active media playback, it only receives `action: 'sync'`. It does not receive `isPlaying = true`, current track timestamp, or scheduled play time.

### Defect 8: AudioNode Accumulation Leak in `scheduleMediaPlayback`
- **Location**: `public/app.js:220-243`
- **Impact**: Each playback invocation creates new Splitter, Gain, and Mix nodes connected to `window.theaterDest` without disconnecting or tearing down prior instances. Additionally, if `initMediaEngine()` has not yet executed, `window.theaterDest` is undefined and `connect()` throws a fatal TypeError.

### Defect 9: NTP Reconnect Stale State
- **Location**: `public/app.js:7, 58-67`
- **Impact**: `timeOffsets` is never reset on socket reconnect. The 11th sample is pushed to the pre-existing 10 samples, corrupting median offset calculation with stale network data.

---

## 7. 4-Tier E2E Test Suite Architecture & Design Plan

To ensure mathematical precision, physical compliance, and network robustness across all components, a **4-Tier Testing Architecture** is designed using Node.js built-in `node:test` and `node:assert`. This requires zero external npm packages and adheres strictly to Android Termux single-threaded constraints.

```
tests/
├── tier1_unit_dsp/
│   ├── test_ms_matrix.js          # Mid/Side phase extraction, polarity & angle math
│   ├── test_crossover_limiter.js  # Butterworth filter curves & DynamicsCompressor specs
│   ├── test_lerp_trajectory.js    # Smoothstep easing, fixed snapshot & convergence
│   ├── test_ntp_math.js           # Median offset, jitter rejection & timestamp conversion
│   └── test_noise_registers.js    # Voss-McCartney IIR state independence & slope
├── tier2_component/
│   ├── test_mode_engine.js        # ModeEngine state machine, tick, start/stop trajectory
│   ├── test_media_engine.js       # MediaEngine state machine, URL, play, pause, broadcast
│   └── test_audio_graph_mock.js   # Mock Web Audio API topology & parameter automation
├── tier3_network/
│   ├── test_socket_mesh.js        # Ephemeral server + multi-client simulation (N=1..8)
│   ├── test_geometry_recalc.js    # 2*PI/N angle recalculation on join/leave/reconnect
│   ├── test_late_join_sync.js     # Late-joining client playback state and sync recovery
│   └── test_jitter_resilience.js  # Artificial network latency injection & lookahead buffer
└── tier4_e2e/
    ├── test_core_switching.js     # End-to-end Mode Core <-> Media Core switching
    ├── test_circadian_cron.js     # Circadian scheduler preset triggers & transition
    └── test_rest_api.js           # HTTP endpoints (/api/state, /api/trajectory, /api/core)
```

### 7.1 Tier 1: Unit & DSP Math Verification
- **Execution**: Pure headless math in Node.js (execution time < 50ms).
- **Test Scenarios**:
  1. `test_ms_matrix.js`:
     - Verify $Mid = (L + R)/2$ and $Side = (L - R)/2$.
     - Verify Mono center dialogue ($L=1, R=1$): $Mid = 1, Side = 0$.
     - Verify Pure out-of-phase stereo reverb ($L=1, R=-1$): $Mid = 0, Side = 1$.
     - Verify Spatial Dipole: Right perimeter node ($\theta \approx \pi/2$) inverts Side polarity compared to Left perimeter node ($\theta \approx 3\pi/2$).
     - Verify Rear center channel attenuation: dialogue does not pass to $\theta = \pi$.
  2. `test_crossover_limiter.js`:
     - Verify Butterworth highpass filter response at 150 Hz ($Q = 0.7071$) attenuates 33 Hz by $> 20\text{ dB}$.
     - Verify 40 Hz highpass filter maintains flat passband ($> 60\text{ Hz}$) with $< 0.1\text{ dB}$ ripple.
     - Verify Brickwall Limiter parameters: threshold -1 dBFS, ratio 20:1, knee 0 dB.
  3. `test_lerp_trajectory.js`:
     - Verify Smoothstep $S(0) = 0, S(0.5) = 0.5, S(1) = 1$.
     - Verify derivative $S'(0) = 0, S'(1) = 0$ (zero initial/terminal jerk).
     - Verify fixed snapshot interpolation: snapshot remains constant, zero creeping drift.
  4. `test_ntp_math.js`:
     - Verify 10-sample array with outlier injection (e.g. +300ms spike) yields accurate median clock offset.
     - Verify conversion of server epoch ms to AudioContext seconds:
       $$t_{audio} = audioCtx.currentTime + \frac{targetSyncTime - serverOffset - Date.now()}{1000}$$

### 7.2 Tier 2: Component & Mock Web Audio Integration Tests
- **Execution**: Node.js with a lightweight headless Web Audio Mock (mocking `AudioContext`, `GainNode`, `BiquadFilterNode`, `PannerNode`, `ChannelSplitterNode`, `ChannelMergerNode`, `DynamicsCompressorNode`).
- **Test Scenarios**:
  1. `test_audio_graph_mock.js`:
     - Verify all signal paths in `initModeEngine()` terminate at `audioCtx.destination` through the crossover and limiter.
     - Verify `baseOsc` and `noiseNode` properly connect through `panner3D` and `breathGain`.
     - Verify `binauralOsc` gain is 0 when `binaural_offset === 0`.
     - Verify no orphaned AudioNodes or cumulative connections on repeated playback triggers.
  2. `test_mode_engine.js` & `test_media_engine.js`:
     - Verify method calls (`startTrajectory`, `stopTrajectory`, `tick`, `setMediaUrl`, `play`, `pause`) produce expected internal state transitions and emit formats.

### 7.3 Tier 3: Network Synchronization & Socket.io Simulation
- **Execution**: Headless HTTP server on ephemeral port (`PORT=0`) with simulated WebSocket/Socket.io client instances.
- **Test Scenarios**:
  1. `test_socket_mesh.js`:
     - Spin up server, connect 4 simulated client sockets.
     - Verify server tracks 4 nodes and assigns $\theta = 0, \pi/2, \pi, 3\pi/2$.
     - Disconnect socket 2; verify recalculation to $N=3$ with $\theta = 0, 2\pi/3, 4\pi/3$.
  2. `test_late_join_sync.js`:
     - Start media playback on active mesh.
     - Connect late-joining socket; verify client receives current media URL, `isPlaying: true`, and correct track seek offset.
  3. `test_jitter_resilience.js`:
     - Introduce synthetic 150ms packet transmission delay.
     - Verify `targetSyncTime` lookahead window (2500ms for Mode, 5000ms for Media) provides positive $t_{audio}$ execution margin on all nodes.

### 7.4 Tier 4: End-to-End System & Cross-Core Scenarios
- **Execution**: Integrated tests verifying full system operational flows.
- **Test Scenarios**:
  1. `test_core_switching.js`:
     - Switch Core: Mode $\rightarrow$ Media $\rightarrow$ Mode.
     - Verify clients receive `core_switch`, tear down prior audio context safely, and transition state cleanly.
  2. `test_circadian_cron.js`:
     - Trigger scheduled cron tasks programmatically.
     - Verify `ModeEngine.startTrajectory` is invoked with corresponding circadian preset vectors.
  3. `test_rest_api.js`:
     - Test all REST endpoints via HTTP:
       - `POST /api/core/switch`
       - `POST /api/trajectory/start`
       - `POST /api/trajectory/stop`
       - `GET /api/state`
       - `POST /api/media/play`
       - `POST /api/media/pause`
  4. Universal QA Check:
     - Run `python ~/.gemini/config/skills/qa-analyzer/scripts/analyzer.py .` to ensure 0 syntax errors across entire suite and source.

---

## 8. Summary of Actionable Implementation Recommendations

1. **Fix `public/app.js` DSP Architecture (R1)**:
   - Fix M/S matrix: invert Side polarity on right hemisphere nodes ($\theta \in (0, \pi)$) and attenuate Mid dialogue at rear ($\theta \approx \pi$).
   - Replace `crossover.type = "allpass"` with `highpass` at 40Hz ($Q = 0.707$) for desktop/TV devices.
   - Insert Hardware Profiling Crossover and Brickwall Limiter into `initModeEngine()` to protect transducers from raw 33Hz tones.
   - Route `baseOsc` through `panner3D` and apply per-node harmonic stacking $f_{local} = f_{base} \cdot r_h^{i \bmod 4}$.
   - Add 2kHz lowpass filter and 0.55 gain on noise engine.
   - Clean up existing AudioNodes in `scheduleMediaPlayback` before creating new ones; ensure `window.theaterDest` is safely initialized.
   - Reset `timeOffsets = []` on socket reconnect in `initNetwork()`.
2. **Fix Network Synchronization & Server Orchestration (R2)**:
   - Add missing `GET /api/state` endpoint to `server.js`.
   - Implement `node-cron` circadian schedule in `server.js` / `ModeEngine.js` for the 6 daily transitions.
   - Update `MediaEngine.js` to track `playbackStartTime` and track offset; broadcast full play state to late-joining nodes.
   - Prevent duplicate socket IDs in `nodes` array in `server.js`.
3. **Establish Automated Verification**:
   - Add `"test": "node --test tests/**/*.js"` to `package.json`.
   - Implement the 4-tier test suite using `node:test` and `node:assert`.
   - Run Universal QA Analyzer on all modified files before committing.
