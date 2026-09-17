# HealingNodes - Phase 2 Implementation Plan

## 1. Architectural Synthesis
The Phase 2 directive merges automated circadian/PID modes with human emotional states and introduces the **Transcendental Hybrid**. This involves moving from a static acoustic mesh to a dynamic system governed by the **Environmental State Vector** and the **Emotional Trajectory Equation**. 

The system relies on Node.js + Socket.io for decentralized state synchronization, and the raw HTML5 Web Audio API and Canvas API for client-side audio/visual rendering.

---

## 2. The Environmental State Vector
The global environment at any point in time is defined by the expanded vector $V$:
`V = [f_base, T_breath, alpha_noise, phi_color, harmonic_ratio, orbital_velocity, binaural_offset]`

- `f_base`: Base frequency of the acoustic mesh (e.g., 33Hz).
- `T_breath`: Breathing LFO period (e.g., 10s). Supports arrays for polyrhythmic breathing.
- `alpha_noise`: Spectral noise exponent (1 for Pink, 2 for Brown, 3 for Red).
- `phi_color`: Base hue angle for visual fluid rendering on Canvas.
- `harmonic_ratio`: The ratio defining the interval for the local node (e.g., 1.2 for Minor Third, 1.618 for Golden Ratio).
- `orbital_velocity`: The speed at which the spatial angle physically orbits/spins around the room.
- `binaural_offset`: The frequency difference used to induce hemispheric brainwave synchronization (Hemi-Sync).

---

## 3. Server-Side Continuous Vector Interpolation

### Interpolation Logic
The server is responsible for interpolating between the current state vector $V_{current}$ and the target state vector $V_{target}$ over a specified duration $D$ (e.g., 45 minutes).

**Data Structure:**
```javascript
class TrajectoryManager {
  constructor() {
    this.currentState = { f_base: 33, T_breath: 10, alpha_noise: 1, phi_color: 200, harmonic_ratio: 1.5, orbital_velocity: 0, binaural_offset: 0 };
    this.targetState = null;
    this.startTime = 0;
    this.duration = 0;
    this.intervalId = null;
  }
  
  startTrajectory(target, durationMs) {
    this.targetState = target;
    this.duration = durationMs;
    this.startTime = Date.now();
    
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.tick(), 1000); // 1Hz update rate
  }

  tick() {
    const now = Date.now();
    let progress = (now - this.startTime) / this.duration;
    if (progress >= 1) {
      progress = 1;
      clearInterval(this.intervalId);
    }
    
    // Apply easing (e.g., smoothstep)
    const eased = progress * progress * (3 - 2 * progress);
    
    // Interpolate Vector V
    for (const key in this.currentState) {
       this.currentState[key] = this.lerp(this.currentState[key], this.targetState[key], eased);
    }
    
    // Broadcast via Socket.io
    io.emit('state_update', { state: this.currentState, timestamp: now });
  }

  lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
  }
}
```

---

## 4. Client-Side Dynamic α (Spectral Noise) Adjustment

### Mathematical Implementation
We adjust the noise spectral density dynamically without Tone.js. We use an `AudioWorkletNode` generating white noise, passed through a cascading filter network designed to approximate $1/f^\alpha$.

For interpolation between Pink ($\alpha=1$) and Brown ($\alpha=2$) noise:
We dynamically blend two noise sources or adjust filter coefficients.

**AudioWorklet Processor Logic Approximation:**
```javascript
// A simple filter approximation for pink/brown noise
class SpectralNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.b0 = 0; this.b1 = 0; this.b2 = 0; this.b3 = 0; this.b4 = 0; this.b5 = 0; this.b6 = 0;
  }
  
  static get parameterDescriptors() {
    return [{ name: 'alpha', defaultValue: 1, minValue: 0, maxValue: 3 }];
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const alpha = parameters.alpha[0]; // Assuming k-rate
    
    for (let channel = 0; channel < output.length; ++channel) {
      const outputChannel = output[channel];
      for (let i = 0; i < outputChannel.length; ++i) {
        const white = Math.random() * 2 - 1;
        
        // Voss-McCartney Pink Noise Approximation (Alpha ~ 1)
        this.b0 = 0.99886 * this.b0 + white * 0.0555179;
        this.b1 = 0.99332 * this.b1 + white * 0.0750759;
        this.b2 = 0.96900 * this.b2 + white * 0.1538520;
        this.b3 = 0.86650 * this.b3 + white * 0.3104856;
        this.b4 = 0.55000 * this.b4 + white * 0.5329522;
        this.b5 = -0.7616 * this.b5 - white * 0.0168980;
        
        let pink = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362;
        pink *= 0.11; // Normalize

        // Brown Noise Approximation (Alpha ~ 2)
        // Integrator filter: y[n] = x[n] + alpha_b * y[n-1]
        this.b6 = (white * 0.02) + (this.b6 * 0.95);
        let brown = this.b6 * 3.5;
        
        // Lerp between Pink and Brown based on alpha parameter (1 to 2)
        const blend = alpha - 1; 
        outputChannel[i] = pink * (1 - blend) + brown * blend;
      }
    }
    return true;
  }
}
```

---

## 5. Harmonic Gliding & Orbital Spatial Audio

### Continuous Frequency Gliding
As the emotional trajectory evolves, the local frequency of a node smoothly glides.
**Node Frequency Formula:**
$$f_{local} = f_{base} \times harmonic\_ratio \times HRTF\_modifier$$

```javascript
function applyHarmonicUpdate(state) {
  const targetFreq = state.f_base * state.harmonic_ratio;
  const now = audioCtx.currentTime;
  // Exponential glide prevents clicking and sounds natural perceptually
  oscillator.frequency.setTargetAtTime(targetFreq, now, 2.0); 
}
```

### Orbital Spatial Panning (The Rotating Room)
In the Transcendental Hybrid mode, the spatial equation is modified so the angle is a function of time, physically orbiting the sound around the listener.
$$\theta(t) = \frac{2\pi \cdot \text{NodeIndex}}{N} + (\text{orbital\_velocity} \cdot t)$$
This is executed via a highly optimized 60fps `requestAnimationFrame` loop that continuously updates `panner3D.positionX` and `positionZ`.

### Hemispheric Synchronization
When `binaural_offset` > 0, the audio engine spawns a secondary oscillator (e.g., `targetFreq + 4Hz`) hard-panned to the opposite ear/node to force brainwave coherence via isochronic/binaural interference patterns.

---

## 6. Admin API and UI Specifications

### API Endpoints
- `POST /api/trajectory/start`
  - Body: `{ targetState: { f_base, T_breath, alpha_noise, phi_color, harmonic_ratio, orbital_velocity, binaural_offset }, durationMs: 2700000 }`
- `POST /api/trajectory/stop`

### Admin UI Presets
1. **Sadness / Catharsis**: `[30Hz, 12s, 2.0 (Brown), 240 (Blue), 1.2 (Minor 3rd), 0 Orbit, 0 Sync]`
2. **Focused / Flow**: `[40Hz, 8s, 1.0 (Pink), 120 (Green), 1.618 (Golden), 0 Orbit, 0 Sync]`
3. **Energetic**: `[55Hz, 4s, 0.5 (White/Pink), 0 (Red), 1.5 (Perfect 5th), 0 Orbit, 0 Sync]`
4. **Deep Thinking**: `[33Hz, 15s, 2.5 (Brown/Red), 280 (Purple), 1.333 (Perfect 4th), 0 Orbit, 0 Sync]`
5. **Transcendental Hybrid (Mind-Blowing)**: `[108Hz Base, 6.18s/10s Polyrhythm, 1.5 Noise, 360 Phase, 1.618 Ratio, 0.05 Orbit Velocity, 4Hz Sync]`
   *Combines polyrhythmic breathing, spatial orbiting, and hemispheric sync.*

### UI Elements
- **Duration Slider**: 1 to 60 Minutes.
- **Current Vector Visualizer**: Real-time canvas rendering of the current interpolating $V$.
- **Manual Override Sliders**: 7 sliders mapped to all elements of $V$.
