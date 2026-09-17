# Healing Nodes: Platform Architecture & Implementation Blueprint

## 1. Browser Capabilities & Limitations (Web Audio API)

- **Audio Rendering**: Client-side synthesis using the native Web Audio API (`AudioContext`). No external audio frameworks. Requires an initial user interaction (the "Enter Daydream" button) to unlock the audio context per browser Autoplay Policy (Chrome, Safari, Firefox).
- **Background Throttling**: Mobile browsers throttle `setInterval`/`setTimeout` in background tabs to ≥1Hz. Audio scheduling is immune because it uses `AudioContext.currentTime` and the `setTargetAtTime` / `cancelScheduledValues` APIs which execute on the browser's C++ audio thread, independent of the JavaScript event loop.
- **WakeLock API**: `navigator.wakeLock.request('screen')` prevents display sleep on mobile nodes so the spatial engine stays active. Gracefully degraded if unsupported.

---

## 2. Signal Graph (Corrected)

```
baseOsc (sine, f_local) ──► oscGain (0.35) ──────────────────────────────────┐
                                                                                ▼
noiseWorklet ──► noiseFilter (LP 2kHz) ──► noiseGain (0.55) ──► panner3D (HRTF) ──► breathGain ──► masterGain ──► destination
                                                                                ▲
binauralOscL (f_local) ──► binGainL ──► ChannelMerger[0] ─────────────────────┘ (WRONG — see binaural note)
binauralOscR (f_local + Δf) ──► binGainR ──► ChannelMerger[1] ──► masterGain (BYPASSES panner — preserves L/R ILD)
```

**Binaural pair routing rationale**: The binaural inter-aural level difference (ILD) must be preserved at the listener's ears. Routing through `PannerNode` would spatialize both channels identically and destroy the beat frequency. The `ChannelMergerNode` delivers L and R directly to `masterGain` output, which the browser maps to hardware L/R channels.

**Node frequencies**:
$$f_{local}(i) = f_{base} \times harmonic\_ratio \times \phi_{HRTF}$$

For node index $i$ of $N$ total nodes, the harmonic multiplier stacks as:
$$f_{local}(i) = f_{base} \times harmonic\_ratio^{\,i \bmod 4}$$

---

## 3. Connectivity & Synchronization

- **Transport**: Socket.io (WebSocket with HTTP long-poll fallback).
- **NTP-style Clock Sync**: The client fires 10 `sync_ping` messages on connect. Each pong returns `serverTime` and the original `clientTime`. RTT = `now - clientTime`. Clock offset = `serverTime - clientTime - RTT/2`. Median of 10 samples is used (robust against outlier spikes).
- **Audio Scheduling Lookahead**: The server broadcasts `targetSyncTime = Date.now() + 2500ms`. The client converts this to a local AudioContext timestamp:
  ```
  t_audio = audioCtx.currentTime + (targetSyncTime - serverTimeOffset - Date.now()) / 1000 + 0.05s
  ```
  All `setTargetAtTime()` calls use `t_audio` as the start point, ensuring all nodes apply the parameter change simultaneously regardless of individual network latency.
- **Jitter**: `setTargetAtTime(value, t, timeConstant=2.0)` provides an exponential ramp — 63% of the change in 2s, eliminating click artifacts from sudden parameter jumps.
- **Auto-reconnect**: Socket.io built-in exponential backoff (`reconnectionDelayMax: 5000`).

---

## 4. Spatial Geometry (Quadtree → Circle)

Phase-offset assignment for $N$ connected nodes:
$$\theta_i = \frac{2\pi \cdot i}{N}, \quad i \in \{0, 1, \ldots, N-1\}$$

This ensures uniform angular separation so wavefronts from all nodes constructively interfere at the geometric center (the listener).

Orbital rotation (Transcendental Hybrid mode):
$$\theta(t) = \theta_i + \omega_{orbit} \cdot t_{audio}$$

The 3D panner position is projected onto the horizontal orbital plane (XZ):
$$x(t) = r \cdot \cos(\theta(t)), \quad z(t) = r \cdot \sin(\theta(t)), \quad y = 0$$

where $r = 2.5$ m with `refDistance = 1` m, `rolloffFactor = 1` (inverse-square model: $I \propto 1/r^2$).

---

## 5. Spectral Noise Engine (Corrected)

**Pink Noise** ($\alpha = 1$, $-3\text{ dB/octave}$): Voss-McCartney 7-term IIR cascade.

**Brown Noise** ($\alpha = 2$, $-6\text{ dB/octave}$): First-order leaky integrator:
$$y[n] = 0.99 \cdot y[n-1] + 0.01 \cdot x[n]$$

**Blend formula** ($t = \text{clamp}(\alpha - 1,\, 0,\, 1)$):
$$\text{out}[n] = \text{pink}[n] \cdot (1 - t) + \text{brown}[n] \cdot t$$

**Critical fix**: The original implementation shared `b6` as both the pink noise stage coefficient AND the brown noise integrator state. This caused both signals to corrupt each other. The corrected implementation uses completely independent state variables (`p0`–`p6` for pink, `this.brown` for brown).

---

## 6. Breathing LFO (Corrected)

The breathing cycle has angular frequency:
$$\omega_{breath} = \frac{2\pi}{T_{breath}}$$

The breath signal:
$$\text{breath}(t) = \sin(\omega_{breath} \cdot t_{audio})$$

Normalized to $[0, 1]$:
$$\text{breathNorm}(t) = \frac{\text{breath}(t) + 1}{2}$$

Applied to `breathGain` (amplitude modulation — the actual audible breath):
$$g_{breath}(t) = 0.75 + 0.25 \cdot \text{breathNorm}(t) \quad \in [0.75, 1.0]$$

Applied visually (canvas pulse radius modulation):
$$r_{pulse}(t) = r_{base} + \text{vibration} \cdot (0.08 \cdot r_{base}) + \text{breath}(t) \cdot (0.06 \cdot r_{base})$$

**Critical fix**: The original code modulated only `breathingFilter.frequency` (400±200 Hz). This produces a barely perceptible timbral wobble, not an audible breath. The corrected implementation modulates `breathGain.gain` directly, producing real amplitude breathing.

---

## 7. Visual Engine Color System (Corrected)

`phi_color` is a **HSL hue angle** $\phi \in [0°, 360°]$. The previous implementation used it as `Math.sin(angle + phi_color)` treating it as a radian offset, which produces arbitrary RGB values with no relationship to intended hue.

Correct: Convert HSL → RGB at each frame:
$$\text{hue}(t) = \phi_{color} + \frac{180°}{\pi} \cdot \theta(t) \cdot 0.3 \pmod{360}$$
$$\text{saturation}(t) = 0.55 + 0.25 \cdot \text{breathNorm}(t)$$
$$\text{lightness}(t) = 0.35 + 0.15 \cdot \text{breathNorm}(t)$$

Then apply the standard HSL-to-RGB transform. Result: colors track the preset hue intent (blue for catharsis, green for focus, red for energy, purple for deep thinking).

**Visual frequency aliasing fix**: Drawing `Math.sin(t · 2π · 33)` on a 60fps canvas produces a fully aliased (invisible) signal — 33 full cycles per second, sampled 60 times. Corrected to use a sub-harmonic:
$$f_{visual} = \frac{f_{base}}{300} \approx 0.11\text{ Hz at 33 Hz}$$

---

## 8. Sound Control & Admin Dashboard

- **Separation**: Admin dashboard at `/admin.html`. Client node at `/` (index.html).
- **REST Endpoints**:
  - `POST /api/trajectory/start` — begin morph: `{ targetState, durationMs }`
  - `POST /api/trajectory/stop` — freeze at current position
  - `GET /api/state` — current vector + node count + active flag
- **Socket Events**: Server emits `admin_state_update` (1Hz telemetry) and `audio_state_update` (per-node with geometry).
- **Admin UI**:
  - 8 preset buttons (Homeostasis, Flow State, Catharsis, Energetic, Deep Thinking, Transcendental Hybrid, Dawn Wake, Sleep Onset)
  - Duration slider: 1–60 minutes
  - 7 manual override sliders (all V dimensions, live label update)
  - Live vector bar visualizer canvas (7 normalized bars, color-coded by hue)
  - Real-time mesh status (node count + all 7 V values)

---

## 9. Automation & Circadian Scheduling

`node-cron` fires automatic morphs at physiologically-motivated times (45-minute transition):

| Time  | State              | Rationale                                         |
|-------|--------------------|---------------------------------------------------|
| 06:00 | Dawn Wake          | Cortisol rise. Alpha/Beta boundary. Warm sunrise hue. |
| 09:00 | Flow State         | Peak cognitive window. 40Hz gamma. Golden ratio. |
| 13:00 | Homeostasis        | Post-lunch dip mitigation. Return to anchor.     |
| 17:00 | Late Creative      | Beta creativity. Slight theta binaural. Violet.  |
| 21:00 | Evening Wind-Down  | Parasympathetic shift. Brown noise. Blue hue.    |
| 23:00 | Sleep Onset        | Delta approach. Sub-20Hz. Red noise. Still field.|

---

## 10. Data Flow

```
Admin UI → POST /api/trajectory/start
             ↓
         TrajectoryManager.startTrajectory(target, durationMs)
             ↓ snapshots startState = { ...currentState }
         setInterval tick() @ 1Hz
             ↓ progress = smoothstep((now - startTime) / duration)
             ↓ currentState[k] = lerp(startState[k], targetState[k], progress)
             ↓
         broadcastState() via Socket.io
             ├─► io.emit('admin_state_update', { nodeCount, state })
             └─► io.to(nodeId).emit('audio_state_update', { baseAngleRads, targetSyncTime, v })
                                                      ↓
                                          Client scheduleAudioUpdate()
                                          setTargetAtTime(param, t_audio, τ)
```

**State mutation correctness**: `startState` is snapshotted once at `startTrajectory()` call time. The `lerp(startState[k], targetState[k], progress)` always interpolates from the fixed snapshot. `currentState` is overwritten each tick but is never the `start` argument. This guarantees clean arrival at `targetState` at `progress = 1`.
