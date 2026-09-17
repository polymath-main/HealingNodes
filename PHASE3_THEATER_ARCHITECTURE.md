# Phase 3: Decentralized Spatial Theater & Hardware Protection

## 1. The Core Concept
Transform the HealingNodes mesh into a distributed spatial audio processor. When a user inputs a media stream (Local Audio, YouTube, Cloud Stream), the Node.js server acts as the Media Sync Orchestrator. The devices in the room mathematically divide the audio spectrum and spatial field among themselves.

## 2. Hardware Safety & Physics Constraints (The Excursion Limiter)
Different devices (Nodes) have vastly different physical acoustic capacities. A subwoofer can handle 30Hz; a phone speaker physically cannot reproduce below ~150Hz.

### The Topology
Every node will now pass through a **Hardware Profiling Crossover** and a **Brickwall Limiter** before reaching `audioCtx.destination`.

**Math & Routing:**
```javascript
// 1. Device Profiling (Determined by Admin UI or Screen Size heuristic)
const isPhone = window.innerWidth < 768; 
const cutoffFreq = isPhone ? 150 : 40; // Phones discard sub-bass, TVs/PCs keep it

// 2. The Excursion Protection Filter
const crossover = audioCtx.createBiquadFilter();
crossover.type = "highpass";
crossover.frequency.value = cutoffFreq; 
crossover.Q.value = 0.707; // Butterworth slope (flat response, no resonance peak)

// 3. Absolute Brickwall Limiter (Prevents Digital Clipping and Coil Damage)
const safetyLimiter = audioCtx.createDynamicsCompressor();
safetyLimiter.threshold.value = -1.0; // Hard limit at -1 dBFS
safetyLimiter.knee.value = 0.0;       // Hard knee (immediate clamping)
safetyLimiter.ratio.value = 20.0;     // Infinite ratio (brickwall)
safetyLimiter.attack.value = 0.002;   // 2ms attack (catch transients instantly)
safetyLimiter.release.value = 0.100;  // 100ms release (prevent pumping)
```

## 3. Mid/Side (M/S) Spatial Expansion for External Media
Instead of just playing the same stereo file on all devices, the mesh will execute mathematical **Mid/Side processing** based on the node's angle ($\frac{2\pi}{N}$).

*   **Mid (Center) Information:** Dialogue, lead vocals, kick drums. (Mathematically: $L + R$)
*   **Side (Perimeter) Information:** Reverb, wide synths, cinematic atmospheres. (Mathematically: $L - R$)

**The Physics:**
If a Node is positioned in front of the user ($\theta \approx 0$ or $2\pi$), it will dynamically phase its audio matrix to output mostly **Mid** information.
If a Node is on the side or rear ($\theta \approx \pi/2$ or $3\pi/2$), it will invert the phase of the Right channel and sum it with the Left, completely canceling the center dialogue and leaving ONLY the wide spatial reverb.

This physically wraps the movie or song around the user's room using pure phase cancellation.

## 4. Psychoacoustic Environmental Overlays
The existing Phase 2 features (Pink/Brown noise, base oscillators, fluid visuals) don't disappear. They become **Psychoacoustic Overlays**.

*   **Example (Deep Thinking Movie Mode):** While watching a film, the engine introduces a barely audible 1/f^2 Brown Noise floor at -40dB to mask real-world room reflections, and injects a 7.83Hz Schumann resonance into the Subwoofer node to physically ground the listener's nervous system while they watch.
*   **Fletcher-Munson Compensation:** If the user turns the master volume down, the DSP automatically boosts the low and high frequencies (Loudness Contour) to match the nonlinear frequency response of human hearing at low SPL (Sound Pressure Levels).

## 5. Media Sync Architecture (NTP Buffer)
To stream YouTube or Cloud audio without phasing/echoes between devices:
1. Server buffers the stream.
2. Server broadcasts a highly compressed AAC chunk to all nodes with a strictly calculated `executionTime = Date.now() + 3000ms`.
3. Nodes load the chunk into an `AudioBufferSourceNode` and call `.start(executionTime)`. 
4. The devices play the audio with microsecond precision, preventing the "stadium echo" effect common in amateur multi-device setups.
