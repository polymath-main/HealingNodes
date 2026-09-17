# HealingNodes — Phase 2 Implementation Plan (Complete & Corrected)

## 1. Architectural Synthesis

Phase 2 moves from a static acoustic mesh to a dynamic system governed by the **Environmental State Vector V** and **Emotional Trajectory Engine**. All client audio synthesis runs locally via Web Audio API AudioWorklet + PannerNode. The server is a pure mathematical orchestrator — it never streams audio, only emits JSON state deltas.

---

## 2. The Environmental State Vector V

$$V = [f_{base},\; T_{breath},\; \alpha_{noise},\; \phi_{color},\; harmonic\_ratio,\; \omega_{orbit},\; \Delta f_{binaural}]$$

| Dimension | Symbol | Unit | Range | Meaning |
|-----------|--------|------|-------|---------|
| Base frequency | $f_{base}$ | Hz | 10–200 | Acoustic mesh anchor. 33Hz = low-gamma binding / vagus resonance. |
| Breath period | $T_{breath}$ | s | 2–30 | LFO period. $\omega_{breath} = 2\pi / T_{breath}$. |
| Noise exponent | $\alpha_{noise}$ | — | 0–3 | 1=pink ($-3$ dB/oct), 2=brown ($-6$ dB/oct), 3=red. |
| Color hue | $\phi_{color}$ | ° | 0–360 | HSL hue angle. Mapped via standard HSL→RGB. |
| Harmonic ratio | $r_h$ | — | 1.0–3.0 | Node frequency multiplier. 1.618=golden, 1.333=P4, 1.5=P5. |
| Orbital velocity | $\omega_{orbit}$ | rad/s | 0–0.2 | Spatial rotation speed in XZ plane around listener. |
| Binaural offset | $\Delta f$ | Hz | 0–40 | L/R beat frequency. 4Hz=theta, 10Hz=alpha, 40Hz=gamma. |

---

## 3. Server-Side Continuous Vector Interpolation (Corrected)

### The Lerp Bug (Fixed)

The previous `TrajectoryManager` called:
```javascript
this.currentState[key] = this.lerp(this.currentState[key], this.targetState[key], eased);
```

Because `currentState` is mutated each tick and `eased` re-computes from `startTime`, `start` is never the original baseline — it's the already-moved value. The interpolation exponentially creeps but never converges cleanly.

**Correct approach**: snapshot `startState` once at trajectory launch. Every tick interpolates the fixed snapshot:

```javascript
// At startTrajectory():
this.startState = { ...this.currentState };  // frozen snapshot

// At each tick():
const progress = smoothstep((Date.now() - this.startTime) / this.duration);
for (const key in this.startState) {
    this.currentState[key] = lerp(this.startState[key], this.targetState[key], progress);
}
```

### Smoothstep Easing

$$S(t) = 3t^2 - 2t^3, \quad t = \text{clamp}\!\left(\frac{t_{elapsed}}{D}, 0, 1\right)$$

This provides:
- Zero velocity at $t=0$ and $t=1$ (no abrupt start/stop)
- Maximum rate of change at $t=0.5$
- Clean arrival at target — $S(1) = 1$ exactly

### Broadcast Format

```json
{
  "nodeCount": 3,
  "myIndex": 1,
  "baseAngleRads": 2.094395,
  "targetSyncTime": 1726000002500,
  "v": {
    "f_base": 40.0,
    "T_breath": 8.0,
    "alpha_noise": 1.0,
    "phi_color": 120.0,
    "harmonic_ratio": 1.618,
    "orbital_velocity": 0.0,
    "binaural_offset": 0.0
  }
}
```

---

## 4. Spectral Noise — AudioWorklet (Corrected)

### Pink Noise: Voss-McCartney IIR Cascade

7-stage cascaded IIR filter approximating $S(f) \propto 1/f$ ($-3$ dB/octave):

```
b0 = 0.99886·b0 + w·0.0555179
b1 = 0.99332·b1 + w·0.0750759
b2 = 0.96900·b2 + w·0.1538520
b3 = 0.86650·b3 + w·0.3104856
b4 = 0.55000·b4 + w·0.5329522
b5 = −0.7616·b5 − w·0.0168980
b6 = w·0.115926
pink = (b0+b1+b2+b3+b4+b5+b6 + w·0.5362) × 0.11
```

### Brown Noise: Leaky Integrator

$$y[n] = 0.99 \cdot y_{prev} + 0.01 \cdot w[n]$$

Spectral density $S(f) \propto 1/f^2$ ($-6$ dB/octave).

**Critical**: Brown state `this.brown` is fully independent of `b0`–`b6`. The previous implementation reused `b6` as the brown integrator, corrupting both signals.

### Blend Formula

$$t_{blend} = \text{clamp}(\alpha_{noise} - 1,\; 0,\; 1)$$
$$\text{out}[n] = \text{pink}[n] \cdot (1 - t_{blend}) + \text{brown}[n] \cdot t_{blend}$$

---

## 5. Audio Signal Graph

```
White Noise (Math.random)
    │
    ▼ Voss-McCartney IIR + Leaky Integrator + blend
AudioWorkletNode 'spectral-noise' [param: alpha]
    │
    ▼ BiquadFilter (lowpass, 2kHz, Q=0.707)  ← anti-alias, keeps sub-sonic warmth
    │
    ▼ GainNode (noiseGain = 0.55)
    │
    ▼ PannerNode (HRTF, inverse, refDist=1m, rolloff=1)
    │                                         ▲
    │              OscillatorNode (sine)       │
    │              freq = f_base × harmonic_ratio
    │                  │
    │              GainNode (oscGain = 0.35) ──┘
    │
    ▼ GainNode (breathGain) ← animated: 0.75 + 0.25·breathNorm(t) @ RAF 60fps
    │
    ▼ GainNode (masterGain = 0.6)
    │
    ├──────────────────────────────────────────────── AudioDestinationNode
    │
    └── ChannelMergerNode (2ch)
           ├─ [L] OscillatorNode (f_local)         ← binauralOscL
           └─ [R] OscillatorNode (f_local + Δf)    ← binauralOscR
        (gain 0 when Δf=0, 0.15 when Δf>0)
        → masterGain (bypasses PannerNode to preserve ILD)
```

### Why Binaural Bypasses PannerNode

The binaural beat effect requires the left ear to hear exactly $f_L$ and the right ear to hear exactly $f_R = f_L + \Delta f$. The brain synthesizes the beat internally at $\Delta f$ Hz. If both channels pass through `PannerNode`, HRTF processing blends them spatially, destroying the precise inter-aural frequency difference. Using `ChannelMergerNode → masterGain` preserves the clean L/R separation.

---

## 6. Harmonic Gliding & Spatial Orbit

### Node Frequency (Per-Node)

$$f_{local}(i) = f_{base} \times r_h^{i \bmod 4}$$

Applied via exponential ramp (perceptually linear, no clicks):
```javascript
oscillator.frequency.cancelScheduledValues(t);
oscillator.frequency.setTargetAtTime(f_local, t_audio, 2.0);
```
Time constant $\tau = 2.0$ s → 63% of the change in 2s.

### Orbital Spatial Panning

$$\theta(t) = \theta_i + \omega_{orbit} \cdot t_{audio}$$
$$x(t) = r \cdot \cos(\theta(t)), \quad z(t) = r \cdot \sin(\theta(t))$$

Updated every animation frame via `requestAnimationFrame` (60fps):
```javascript
panner3D.positionX.setValueAtTime(r * Math.cos(angle), audioCtx.currentTime);
panner3D.positionZ.setValueAtTime(r * Math.sin(angle), audioCtx.currentTime);
```

---

## 7. Breathing LFO

$$\omega_{breath} = \frac{2\pi}{T_{breath}}$$

$$g_{breath}(t) = 0.75 + 0.25 \cdot \frac{\sin(\omega_{breath} \cdot t) + 1}{2}$$

Applied to `breathGain.gain` every frame. Range: $[0.75, 1.0]$ — produces 25% amplitude modulation, perceived as the room "breathing."

---

## 8. Visual Engine (Corrected)

### Color — HSL from phi_color

`phi_color` is a hue angle in degrees (0–360). It is NOT a radian offset for `Math.sin`.

```javascript
const hue = (phi_color + (currentAngle * 180/Math.PI * 0.3)) % 360;
const sat  = 0.55 + breathNorm * 0.25;
const lit  = 0.35 + breathNorm * 0.15;
const [r, g, b] = hslToRgb(hue, sat, lit);
```

### Visual Pulsation — Sub-Harmonic

`f_base` (e.g. 33Hz) is above the Nyquist frequency of 60fps display (30Hz). Directly drawing `Math.sin(t · 2π · 33)` produces aliased noise. Corrected to sub-harmonic:

$$f_{visual} = \frac{f_{base}}{300}$$

At 33Hz → $f_{visual} \approx 0.11$ Hz → visible slow pulse every ~9 seconds.

### Layer Geometry

3 concentric fluid boundaries, each at a phase offset of $2\pi/3$:
$$\text{distortion}(\theta, t, \text{layer}) = A_1 \sin(\theta \cdot n_1 \cdot r_h + t \cdot \omega_1 + \phi_{layer}) + A_2 \cos(\theta \cdot n_2 \cdot r_h - t \cdot \omega_2 + \phi_{layer})$$

Where $\phi_{layer} = 2\pi \cdot \text{layer} / 3$.

---

## 9. Admin Presets — Real-World Sensed Values

| Preset | f_base | T_breath | α | φ hue | ratio | ω_orbit | Δf | Rationale |
|--------|--------|----------|---|-------|-------|---------|-----|-----------|
| Homeostasis | 33Hz | 10s | 1.0 (Pink) | 200° (Teal) | 1.5 (P5) | 0 | 0 | Baseline anchor |
| Flow State | 40Hz | 8s | 1.0 (Pink) | 120° (Green) | 1.618 (φ) | 0 | 0 | Gamma focus |
| Catharsis | 30Hz | 12s | 2.0 (Brown) | 240° (Blue) | 1.2 (m3) | 0.008 | 0 | Minor mode, heavy |
| Energetic | 55Hz | 4s | 0.5 (White) | 15° (Red) | 1.5 (P5) | 0.025 | 0 | High beta, fast |
| Deep Thinking | 33Hz | 15s | 2.5 (Red) | 280° (Purple) | 1.333 (P4) | 0 | 4Hz | Theta entrainment |
| Transcendental | 108Hz | 6.18s | 1.5 | 0° (Red) | 1.618 (φ) | 0.05 | 4Hz | Sacred tone, orbit |
| Dawn Wake | 40Hz | 8s | 1.0 (Pink) | 40° (Yellow) | 1.618 (φ) | 0.01 | 0 | Cortisol rise |
| Sleep Onset | 20Hz | 18s | 2.8 (Red) | 260° (Indigo) | 1.0 | 0 | 0 | Delta descent |

---

## 10. API Specification

### `POST /api/trajectory/start`
```json
{
  "targetState": {
    "f_base": 40,
    "T_breath": 8,
    "alpha_noise": 1.0,
    "phi_color": 120,
    "harmonic_ratio": 1.618,
    "orbital_velocity": 0,
    "binaural_offset": 0
  },
  "durationMs": 300000
}
```
Response: `{ "success": true, "target": {...}, "durationMs": 300000 }`

### `POST /api/trajectory/stop`
Freezes `currentState` at its current interpolated position. Clears `active` flag.
Response: `{ "success": true, "frozenState": {...} }`

### `GET /api/state`
Response: `{ "nodeCount": 2, "state": {...V...}, "active": true }`

---

## 11. Circadian Automation Schedule

`node-cron` fires automatic morphs (45-minute transition) at physiologically motivated hours:

| Hour | Target State | Notes |
|------|-------------|-------|
| 06:00 | Dawn Wake (40Hz, φ, Yellow, ω=0.01) | Sunrise cortisol + alpha wake |
| 09:00 | Flow State (40Hz, φ, Green) | Peak cognitive window |
| 13:00 | Homeostasis (33Hz) | Post-lunch parasympathetic anchor |
| 17:00 | Late Creative (38Hz, 1.2, Purple, Δf=2Hz) | Beta creativity |
| 21:00 | Evening Wind-Down (30Hz, Brown, Blue) | Parasympathetic shift |
| 23:00 | Sleep Onset (20Hz, Red, Indigo) | Delta descent |
