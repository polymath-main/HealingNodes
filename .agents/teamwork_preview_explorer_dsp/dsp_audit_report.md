# Comprehensive Web Audio DSP Architectural & Acoustic Audit Report
**Project**: HealingNodes Dual-Core Distributed Spatial Audio Engine  
**Target File**: `public/app.js`  
**Referenced Specifications**: `ARCHITECTURE_BLUEPRINT.md`, `THEORY.md`, `PHASE2_IMPLEMENTATION_PLAN.md`, `PHASE3_THEATER_ARCHITECTURE.md`  
**Auditor**: DSP Codebase Explorer  
**Date**: 2026-09-17  

---

## 1. Executive Summary

A rigorous structural and mathematical investigation of `public/app.js` and associated platform blueprints was conducted. While the architectural concept of a decentralized acoustic mesh utilizing browser-native Web Audio API nodes is innovative, the DSP implementation in `public/app.js` contains several **critical mathematical errors**, **acoustic phase violations**, and **Web Audio API routing defects**.

### Key Findings Matrix

| Audit Domain | Status | Severity | Primary Defect |
| :--- | :--- | :--- | :--- |
| **1. Mid/Side Matrix** | **FAILED** | **CRITICAL** | Absence of decoding matrix; mono downmixing; polarity inversion on right nodes ($\theta = 3\pi/2$); rear node blares front dialogue due to `Math.abs(Math.cos)`. |
| **2. Crossovers** | **FAILED** | **HIGH** | Not a crossover network; phone runs 2nd-order HPF while PC runs unconfigured 350Hz allpass, inducing severe room comb filtering; 2nd-order Butterworth summing yields $\pm 3\text{ dB}$ or nulls instead of Linkwitz-Riley flat summation. |
| **3. Brickwall Limiter** | **FAILED** | **HIGH** | `DynamicsCompressorNode` max ratio is 20:1 (not $\infty:1$); 2ms attack without lookahead allows transient clipping; zero knee induces pumping; Core 1 completely lacks a limiter. |
| **4. Spatial & Binaural** | **FAILED** | **CRITICAL** | Base grounding oscillator hijacked into Left channel of binaural merger; noise missing 2kHz lowpass; HRTF panner coordinates rotated $90^\circ$; Worklet state shared across channels; harmonic stacking ($i \bmod 4$) omitted. |
| **5. Engine Lifecycle** | **FAILED** | **MEDIUM** | Race condition: `theaterDest` undefined if play event precedes user start gesture, crashing audio thread; `AudioContext` closed without proper resume handlers. |

---

## 2. Investigation Scope & Methodology

The audit examined:
1. `public/app.js` (314 lines) — The active client-side DSP and visual rendering engine.
2. `ARCHITECTURE_BLUEPRINT.md` — The canonical signal graph specification and clock synchronization protocol.
3. `THEORY.md` — Quadtree spatial geometry, 33 Hz low-gamma binding theory, and $\pi$-based phase distribution.
4. `PHASE2_IMPLEMENTATION_PLAN.md` — Vector $V$ state space, Voss-McCartney IIR pink noise worklet, and breathing LFO.
5. `PHASE3_THEATER_ARCHITECTURE.md` — Mid/Side spatial expansion and excursion limiting specifications.

The analysis evaluates compliance against:
- **W3C Web Audio API Recommendation (2021/2024)** (Channel mixing rules, AudioNode connection semantics, AudioParam automation quantum behavior).
- **Acoustic Physics & Stereophony** (Blumlein coincident pair theory, Ambisonic horizontal decoding, Linkwitz-Riley crossover transfer functions, inter-aural level/time differences).

---

## 3. Deep-Dive Audit Item 1: Mid/Side Phase Extraction & Decoding Matrix

### 3.1 Mathematical Theory of Mid/Side Processing
In stereophonic signal processing:
- **Mid ($M$)**: Sum of channels containing center-panned coherent acoustic energy (dialogue, lead vocals, kick drum, bass).
  $$M = \frac{L + R}{2} \quad \text{or} \quad M = \frac{L + R}{\sqrt{2}} \quad (\text{constant power})$$
- **Side ($S$)**: Difference of channels containing decorrelated ambient/lateral energy (reverberation, stereo spread, spatial effects).
  $$S = \frac{L - R}{2} \quad \text{or} \quad S = \frac{L - R}{\sqrt{2}}$$
- **Canonical Stereo Reconstruction (Decoding)**:
  $$L = M + S = \frac{L + R}{2} + \frac{L - R}{2} = L$$
  $$R = M - S = \frac{L + R}{2} - \frac{L - R}{2} = R$$

### 3.2 Code Observation: Extraction (`public/app.js`, lines 219–230)
```javascript
219:     // --- M/S Phase Extraction Matrix ---
220:     const splitter = audioCtx.createChannelSplitter(2);
221:     mediaSource.connect(splitter);
222: 
223:     const midMix = audioCtx.createGain(); midMix.gain.value = 0.5; // (L+R)/2
224:     splitter.connect(midMix, 0); splitter.connect(midMix, 1);
225: 
226:     const sideMix = audioCtx.createGain(); sideMix.gain.value = 0.5; // (L-R)/2
227:     const invertGain = audioCtx.createGain(); invertGain.gain.value = -1.0;
228:     splitter.connect(sideMix, 0); 
229:     splitter.connect(invertGain, 1); invertGain.connect(sideMix);
```

#### Verification of Extraction:
- `splitter` outputs 0 (Left) and 1 (Right) are mono (1 channel).
- When both connect to `midMix`, Web Audio input mixing rules sum them: $(L + R)$. With `midMix.gain.value = 0.5`, output is $\frac{L + R}{2}$.
- `splitter` output 1 is inverted by `invertGain` (gain $-1.0$) and summed with output 0 into `sideMix` (gain $0.5$), producing $\frac{L - R}{2}$.
- **Extraction Result**: The extraction math itself is mathematically correct and valid according to W3C Web Audio API.

---

### 3.3 Code Observation: Distribution & Absence of Decoding (`public/app.js`, lines 231–241)
```javascript
231:     // Dynamic mix based on physical geometry
232:     const mixRatio = Math.abs(Math.cos(baseNodeAngle)); // 0 rad = 1 (Mid). PI/2 rad = 0 (Side)
233:     const finalMix = audioCtx.createGain();
234:     
235:     const applyMid = audioCtx.createGain(); applyMid.gain.value = mixRatio;
236:     const applySide = audioCtx.createGain(); applySide.gain.value = 1.0 - mixRatio;
237:     
238:     midMix.connect(applyMid); applyMid.connect(finalMix);
239:     sideMix.connect(applySide); applySide.connect(finalMix);
240:     
241:     finalMix.connect(window.theaterDest); // Route to crossover & limiter
```

#### Defect 1.1: Complete Lack of Stereo Decoding Matrix
`finalMix` sums `applyMid` and `applySide` into a **single 1-channel mono bus**:
$$\text{finalMix} = \text{mixRatio} \cdot M + (1 - \text{mixRatio}) \cdot S$$
`finalMix` connects through `crossover` and `limiter` directly to `audioCtx.destination`. Under W3C up-mixing rules, a mono signal connected to a 2-channel destination is mirrored identically to both left and right physical outputs:
$$L_{out} = \text{finalMix}, \quad R_{out} = \text{finalMix}$$
There is **NO `ChannelMergerNode`**, and **NO $(M + S)$ / $(M - S)$ stereo decoding**. Every device in the mesh plays pure monophonic sound across both its speakers/headphones.

#### Defect 1.2: Acoustic Polarity & Chirality Inversion on Right Nodes
Line 232 computes:
`const mixRatio = Math.abs(Math.cos(baseNodeAngle));`
Consider a 4-node distributed mesh where $\theta_i = \frac{2\pi i}{4}$:
1. **Node 0 ($\theta = 0$, Front Center)**:
   $\text{mixRatio} = |\cos(0)| = 1.0 \implies \text{Node outputs } M = \frac{L + R}{2}$. (Correct for center dialogue).
2. **Node 1 ($\theta = \frac{\pi}{2}$, Left Side, 90°)**:
   $\text{mixRatio} = |\cos(\frac{\pi}{2})| = 0.0 \implies \text{Node outputs } +S = \frac{L - R}{2}$.
3. **Node 2 ($\theta = \pi$, Rear Center, 180°)**:
   $\text{mixRatio} = |\cos(\pi)| = |-1| = 1.0 \implies \text{Node outputs } M = \frac{L + R}{2}$!
   **Flaw**: The rear surround speaker outputs 100% front-center dialogue rather than surround diffuse ambience!
4. **Node 3 ($\theta = \frac{3\pi}{2}$, Right Side, 270°)**:
   $\text{mixRatio} = |\cos(\frac{3\pi}{2})| = 0.0 \implies \text{Node outputs } +S = \frac{L - R}{2}$!
   **Fatal Flaw**: Node 3 is positioned on the **RIGHT** side of the room, but plays $+S = \frac{L - R}{2}$.
   In physical acoustics, the lateral dipole velocity pattern is antisymmetric:
   $$S(\theta) = S \cdot \sin(\theta)$$
   At the Right position ($\theta = \frac{3\pi}{2}$ or $-90^\circ$), $\sin(\frac{3\pi}{2}) = -1$. The acoustic output MUST be:
   $$-S = -(L - R)/2 = \frac{R - L}{2}$$
   Because `app.js` uses `Math.abs(Math.cos(baseNodeAngle))` and adds positive `sideMix`, Node 3 outputs $+L - R$.
   If an actor speaks on the right ($L=0, R=1$):
   - Node 1 (Left) plays: $+S = -0.5$.
   - Node 3 (Right) plays: $+S = -0.5$.
   The right side of the room plays inverted phase of the actor's voice, while the right channel is completely absent! The acoustic stereophonic soundstage in the room is completely scrambled.

#### Defect 1.3: Destructive Phase Cancellation at Intermediate Angles
For intermediate angles (e.g. $\theta = \frac{\pi}{4} = 45^\circ$, where $\cos(\frac{\pi}{4}) \approx 0.7071$):
$$\text{finalMix} = 0.7071 \cdot \left(\frac{L + R}{2}\right) + (1 - 0.7071) \cdot \left(\frac{L - R}{2}\right) = 0.5 L + 0.2071 R$$
Summing $M$ and $S$ into a single scalar channel cancels out a significant portion of $R$ ($-3.8\text{ dB}$ attenuation on $R$, $+0\text{ dB}$ on $L$), artificially pulling the phantom image toward the left channel regardless of where the node is placed.

### 3.4 Corrected Distributed Decoding Architecture
For distributed single-device nodes (rendering acoustic radiation into a room at angle $\theta$):
The soundfield pressure at angle $\theta$ follows the 1st-order coincident microphone / Ambisonic formulation:
$$P(\theta) = M + S \cdot \sin(\theta)$$
- Front ($\theta = 0$): $P(0) = M + 0 = M$ (Pure Center).
- Left ($\theta = \pi/2$): $P(\pi/2) = M + S = L$ (Pure Left!).
- Right ($\theta = 3\pi/2$): $P(3\pi/2) = M - S = R$ (Pure Right!).
- Rear ($\theta = \pi$): $P(\pi) = M - 0 = M$, or with cardioid directivity factor $\frac{1 + \cos\theta}{2}$, dialogue in the rear is attenuated and surround ambience preserved.

If the node itself is a **stereo playback device** (phones, laptops, TVs), it should decode $M$ and $S$ into stereo output:
$$L_{out} = M + S \cdot w_{side}, \quad R_{out} = M - S \cdot w_{side}$$
where $w_{side} = 1 + \sin^2(\theta)$ dynamically widens the stereo image for off-center devices.

---

## 4. Deep-Dive Audit Item 2: Butterworth Hardware Crossovers & Phase Alignment

### 4.1 Web Audio BiquadFilterNode Specifications
In the Web Audio API, `audioCtx.createBiquadFilter()` implements standard 2nd-order (12 dB/octave) digital biquad filters derived from Robert Bristow-Johnson’s Audio EQ Cookbook.
For `type = "lowpass"` and `type = "highpass"`, setting `Q.value = 0.7071` ($\frac{1}{\sqrt{2}}$) produces a **2nd-order Butterworth filter**, characterized by a maximally flat magnitude response in the passband.

### 4.2 Mathematical Proof: The 2nd-Order Butterworth Crossover Failure
Let the crossover cutoff frequency be $\omega_0 = 2\pi f_c$.
The continuous-time analog prototype transfer functions for 2nd-order Butterworth filters are:
$$H_{LP}(s) = \frac{\omega_0^2}{s^2 + \sqrt{2}\omega_0 s + \omega_0^2}$$
$$H_{HP}(s) = \frac{s^2}{s^2 + \sqrt{2}\omega_0 s + \omega_0^2}$$
Evaluating along the frequency axis $s = j\omega$ at the crossover frequency $\omega = \omega_0$:
$$H_{LP}(j\omega_0) = \frac{\omega_0^2}{-\omega_0^2 + j\sqrt{2}\omega_0^2 + \omega_0^2} = \frac{1}{j\sqrt{2}} = -j\frac{1}{\sqrt{2}} = \frac{1}{\sqrt{2}} \angle -90^\circ \quad (-3.01\text{ dB})$$
$$H_{HP}(j\omega_0) = \frac{-\omega_0^2}{-\omega_0^2 + j\sqrt{2}\omega_0^2 + \omega_0^2} = \frac{-1}{j\sqrt{2}} = j\frac{1}{\sqrt{2}} = \frac{1}{\sqrt{2}} \angle +90^\circ \quad (-3.01\text{ dB})$$

#### Acoustic Summation:
1. **In-Phase Summation ($H_{LP} + H_{HP}$)**:
   $$H_{sum}(j\omega_0) = -j\frac{1}{\sqrt{2}} + j\frac{1}{\sqrt{2}} = 0 \quad (-\infty\text{ dB})$$
   **The two filters are $180^\circ$ out of phase at the crossover frequency. Direct summing produces a COMPLETE NOTCH / NULL.**
2. **Inverted Polarity Summation ($H_{LP} - H_{HP}$)**:
   $$H_{sum}(j\omega_0) = -j\frac{1}{\sqrt{2}} - j\frac{1}{\sqrt{2}} = -j\sqrt{2} \implies |H_{sum}(j\omega_0)| = \sqrt{2} = +3.01\text{ dB}$$
   **Inverting one band produces a $+3\text{ dB}$ resonance peak at the crossover frequency.**

Therefore, **a 2nd-order Butterworth crossover can NEVER yield a flat magnitude response when summed acoustically.**

### 4.3 The Linkwitz-Riley Standard (LR4 & LR2)
To achieve flat acoustic magnitude response across the crossover band ($0\text{ dB}$ gain at $\omega_0$ with no lobing):
1. **4th-Order Linkwitz-Riley (LR4, 24 dB/octave)**:
   Formed by cascading **TWO identical 2nd-order Butterworth filters ($Q = 0.7071$) in series**:
   $$H_{LR4\_LP}(s) = [H_{Butt2\_LP}(s)]^2, \quad H_{LR4\_HP}(s) = [H_{Butt2\_HP}(s)]^2$$
   At $\omega = \omega_0$:
   $$H_{LR4\_LP}(j\omega_0) = \left(-j\frac{1}{\sqrt{2}}\right)^2 = -\frac{1}{2} = 0.5 \angle 180^\circ \quad (-6.02\text{ dB})$$
   $$H_{LR4\_HP}(j\omega_0) = \left(j\frac{1}{\sqrt{2}}\right)^2 = -\frac{1}{2} = 0.5 \angle 180^\circ \quad (-6.02\text{ dB})$$
   Sum:
   $$H_{LR4\_sum}(j\omega_0) = -0.5 + (-0.5) = -1.0 = 1.0 \angle 180^\circ \quad (\mathbf{0.00\text{ dB, Flat!}})$$
   The phase difference between low and high bands is **$0^\circ$ across the entire spectrum**.
2. **2nd-Order Linkwitz-Riley (LR2, 12 dB/octave)**:
   Formed using a single 2nd-order biquad with **critically damped $Q = 0.5$** and an inverted highpass branch:
   $$|H_{LP}(j\omega_0)| = 0.5 \quad (-6\text{ dB}), \quad |H_{HP}(j\omega_0)| = 0.5 \quad (-6\text{ dB})$$
   Sum with inversion: $0.5 - (-0.5) = 1.0$ ($0\text{ dB}$ flat).

---

### 4.4 Code Observation: Crossover in `public/app.js` (lines 185–194)
```javascript
185:     const isPhone = window.innerWidth < 768;
186:     const crossover = audioCtx.createBiquadFilter();
187:     if (isPhone) {
188:         crossover.type = "highpass";
189:         crossover.frequency.value = 150; // Protect phone speakers
190:         crossover.Q.value = 0.707; // Butterworth
191:     } else {
192:         crossover.type = "allpass"; // Let subs through
193:     }
```

#### Defect 2.1: False Crossover Architecture
- This code does **NOT** implement a crossover network. It is a single highpass filter on mobile devices, and an allpass filter on desktop devices.
- Low frequencies (<150 Hz) on mobile devices are simply discarded rather than routed to subwoofer or desktop nodes.
- Desktop/TV nodes have `crossover.type = "allpass"`. Because `crossover.frequency.value` is omitted in the `else` branch, it defaults to the Web Audio default of **350 Hz**.
- A 2nd-order allpass filter at 350 Hz passes all frequencies at unity gain, but introduces a **$180^\circ$ phase inversion around 350 Hz**.
- When a phone node (highpassed at 150 Hz) and a PC node (allpass phase-rotated at 350 Hz) play together in the same room, the acoustic soundwaves collide with chaotic phase offsets, creating **severe comb filtering, phase cancellation, and hollow vocal coloration** in the crucial 150 Hz–800 Hz range.

---

## 5. Deep-Dive Audit Item 3: Brickwall Limiters & Dynamics Control

### 5.1 Code Observation: Limiter in `public/app.js` (lines 196–201)
```javascript
196:     // 2. Brickwall Limiter
197:     const limiter = audioCtx.createDynamicsCompressor();
198:     limiter.threshold.value = -1.0; limiter.knee.value = 0.0; limiter.ratio.value = 20.0;
199:     limiter.attack.value = 0.002; limiter.release.value = 0.100;
200:     
201:     crossover.connect(limiter);
202:     limiter.connect(audioCtx.destination);
```

### 5.2 Failure Analysis: Why DynamicsCompressorNode Cannot Be a Brickwall Limiter

#### Defect 3.1: Ratio Clamping at 20:1 (Not Infinite $\infty:1$)
In the W3C Web Audio API specification, `DynamicsCompressorNode.ratio` is clamped to a maximum value of **20.0**.
A 20:1 ratio is a standard mastering compressor, **not a brickwall limiter**.
If an incoming transient or unnormalized media signal exceeds the $-1.0\text{ dBFS}$ threshold by $+10\text{ dB}$ (e.g. $+9\text{ dBFS}$ input level):
$$\text{Output Level} = \text{Threshold} + \frac{\text{Input} - \text{Threshold}}{\text{Ratio}} = -1.0 + \frac{10.0}{20.0} = -0.5\text{ dBFS}$$
If input level spikes by $+22\text{ dB}$:
$$\text{Output Level} = -1.0 + \frac{22.0}{20.0} = +0.1\text{ dBFS} > 0\text{ dBFS} \implies \mathbf{HARD\ DIGITAL\ CLIPPING}$$
The compressor fails to prevent digital ceiling breaches.

#### Defect 3.2: 2ms Attack Without Lookahead Causes Transient Slicing
- `limiter.attack.value = 0.002` (2 milliseconds).
- Web Audio `DynamicsCompressorNode` has **no internal lookahead delay buffer**.
- Any transient with a rise time faster than 2 ms (percussion strikes, drum transients, synthesized clicks) passes through the node unattenuated before the envelope detector can ramp down gain.
- These overshoot peaks directly slam into `audioCtx.destination`, causing audible digital harshness and inter-sample clipping on mobile DACs.

#### Defect 3.3: Zero Knee & 100ms Release Induces Pumping
- `knee.value = 0.0` imposes a hard piecewise knee. The transition from linear amplification to 20:1 compression is instantaneous, generating harmonic distortion at the threshold boundary.
- `release.value = 0.100` (100 ms). Low-frequency signals (e.g. 50 Hz sub-bass has a period of 20 ms) complete 5 full cycles within one release window. The envelope follower tracks individual waveform crests rather than the signal RMS envelope, resulting in severe **gain modulation, waveform flat-topping, and audible pumping**.

#### Defect 3.4: Complete Absence of Limiter in Core 1 (Mode Engine)
In `initModeEngine()` (lines 136–167), `masterGain` connects directly to `audioCtx.destination`:
```javascript
137: const masterGain = audioCtx.createGain(); masterGain.gain.value = 0.316; masterGain.connect(audioCtx.destination);
```
There is **NO limiter, compressor, or saturation clipper in the entire Mode Engine graph**.
In `SpectralNoiseProcessor`:
`outChannel[i] = pink * (1 - blend) + (this.brown * 3.5) * blend;`
Peak output of the brown noise stage regularly exceeds $\pm 3.5$. Summed with `baseOsc` ($0.8$) and `binauralOsc` ($0.8$) plus HRTF panner boosts, peak levels easily exceed $+12\text{ dBFS}$. Even after master attenuation ($0.316 \approx -10\text{ dB}$), signals exceed 0 dBFS and produce digital clipping during high-energy states.

### 5.3 Correct Limiter Architecture for Web Audio
To implement an authentic brickwall limiter in Web Audio:
1. **Pre-limiter Gain Staging**: Maintain headroom at $-3\text{ dBFS}$.
2. **Lookahead Delay Buffer**: Introduce a `DelayNode` ($3\text{ ms}$) on the audio path so envelope detection precedes the audio transient.
3. **Cubic / Tanh Soft-Clipping WaveShaper**: Place a `WaveShaperNode` downstream of the dynamics compressor to establish a mathematical ceiling at $1.0$:
   $$f(x) = \tanh(x) \quad \text{or} \quad f(x) = \begin{cases} x & |x| \le \frac{2}{3} \\ \text{sign}(x)\left(\frac{3 - (2 - 3|x|)^2}{3}\right) & \frac{2}{3} < |x| \le 1 \\ \text{sign}(x) \cdot 1.0 & |x| > 1 \end{cases}$$
   This guarantees that no sample can ever exceed $0.0\text{ dBFS}$.

---

## 6. Deep-Dive Audit Item 4: Additional DSP & Acoustic Flaws in `public/app.js`

### 6.1 Flaw 4.1: Binaural / Base Oscillator Graph Corruption (`app.js`, lines 139–153)
```javascript
139:     // Hard-pan Binaural via ChannelMerger (Fix for Binaural blending bug)
140:     const merger = audioCtx.createChannelMerger(2);
141:     merger.connect(masterGain);
142: 
143:     const baseOscGain = audioCtx.createGain(); baseOscGain.gain.value = 0.8;
144:     const binOscGain = audioCtx.createGain(); binOscGain.gain.value = 0.8;
145:     
146:     baseOscGain.connect(merger, 0, 0); // L
147:     binOscGain.connect(merger, 0, 1);  // R
148: 
149:     baseOsc = audioCtx.createOscillator(); binauralOsc = audioCtx.createOscillator();
150:     const initialFreq = currentV.f_base * currentV.harmonic_ratio;
151:     baseOsc.frequency.value = initialFreq; binauralOsc.frequency.value = initialFreq + currentV.binaural_offset;
152:     baseOsc.connect(baseOscGain); binauralOsc.connect(binOscGain);
```

#### Blueprint Specification (`ARCHITECTURE_BLUEPRINT.md`, Section 2):
The blueprint specifies:
1. `baseOsc` (sine, $f_{local}$) $\to$ `oscGain` ($0.35$) $\to$ `panner3D` (HRTF) $\to$ spatial room soundfield.
2. A separate `binauralOscL` / `binauralOscR` pair routed through `ChannelMergerNode` to `masterGain`, gated to gain $0.0$ when $\Delta f = 0$, and active ($0.15$) only when $\Delta f > 0$.

#### Violation in `app.js`:
- `baseOsc` has been hijacked as the Left ear of the binaural merger!
- The fundamental 33 Hz grounding tone is **completely removed from the 3D spatial field** (`panner3D`) and hard-panned into the listener's left ear at full gain ($0.8$).
- When $\Delta f = 0$ (default in Homeostasis, Flow State, Catharsis, Energetic), both oscillators run at identical frequencies at high amplitude, firing into Left and Right ears in dual-mono.
- When $\Delta f > 0$, the acoustic mesh's grounding frequency itself is detuned, destroying the spatial anchor.

---

### 6.2 Flaw 4.2: Missing 2kHz Lowpass Anti-Aliasing Filter on Noise Generator
- Both `ARCHITECTURE_BLUEPRINT.md` (line 16) and `PHASE2_IMPLEMENTATION_PLAN.md` (line 120) mandate:
  `noiseWorklet ──► noiseFilter (LP 2kHz, Q=0.707) ──► noiseGain (0.55) ──► panner3D`
- In `public/app.js` line 162:
  `noiseNode.connect(breathingFilter);`
  `breathingFilter.connect(panner3D);`
- **No lowpass filter exists in the signal path**. High-frequency noise up to $24\text{ kHz}$ (Nyquist) is piped directly into the HRTF panner, producing harsh digital sibilance that defeats the relaxation objective of the engine.

---

### 6.3 Flaw 4.3: HRTF Spatial Geometry & Chirality Inversion (`app.js`, lines 270–273)
```javascript
270:             if (panner3D) {
271:                 panner3D.positionX.setValueAtTime(2 * Math.cos(currentAngleRads), time);
272:                 panner3D.positionZ.setValueAtTime(2 * Math.sin(currentAngleRads), time);
273:             }
```
- In the W3C Web Audio API coordinate standard:
  - Origin: $(0, 0, 0)$.
  - Default Listener Orientation: Forward is $(0, 0, -1)$ (negative Z), Up is $(0, 1, 0)$ (positive Y), Right is $(1, 0, 0)$ (positive X).
- In `app.js`:
  - At $\theta = 0$: $x = 2 \cos(0) = 2$, $z = 2 \sin(0) = 0 \implies (2, 0, 0)$.
    **Position $(2, 0, 0)$ is directly to the listener's RIGHT ear**, not Front Center!
  - At $\theta = \frac{\pi}{2}$: $x = 0, z = 2 \implies (0, 0, 2)$.
    **Position $(0, 0, 2)$ is directly BEHIND the listener** (positive Z is back, negative Z is forward)!
- **Impact**: The entire spatial acoustic orbit is rotated by $90^\circ$ and inverted relative to the user's room coordinate system. When the user faces the visual screen, audio intended to be in front orbits to the far right.
- **Correct Mapping**:
  $$x(t) = r \sin(\theta(t)), \quad z(t) = -r \cos(\theta(t))$$
  At $\theta = 0$: $x = 0, z = -r$ (directly in front).
  At $\theta = \frac{\pi}{2}$: $x = r, z = 0$ (directly to the right).

---

### 6.4 Flaw 4.4: AudioWorklet Multi-Channel State Collision & Alpha Parameter Truncation (`app.js`, lines 21–48)
```javascript
27:         for (let channel = 0; channel < output.length; ++channel) {
28:             const outChannel = output[channel];
29:             for (let i = 0; i < outChannel.length; ++i) {
30:                 const white = Math.random() * 2 - 1;
31:                 this.b0 = 0.99886 * this.b0 + white * 0.0555179;
                    ...
39:                 this.brown = (white * 0.02) + (this.brown * 0.95);
40:                 let blend = Math.max(0, Math.min(1, alpha - 1));
41:                 outChannel[i] = pink * (1 - blend) + (this.brown * 3.5) * blend;
42:             }
43:         }
```

#### Defect 4.4A: Shared Filter State Across Channels
- `this.b0` through `this.b6` and `this.brown` are single instance variables.
- If `output.length == 2` (stereo worklet output), channel 0 computes 128 samples and mutates `this.b0`...`this.b6`. Then channel 1 processes 128 samples using the corrupted endpoint states of channel 0 with different random numbers!
- This causes inter-channel feedback and phase correlation anomalies.

#### Defect 4.4B: Alpha Parameter Range Truncation
- Line 40 computes:
  `let blend = Math.max(0, Math.min(1, alpha - 1));`
- Under `PHASE2_IMPLEMENTATION_PLAN.md` (Table 9), $\alpha$ ranges from $0$ to $3$:
  - $\alpha = 0.5$ (White Noise, "Energetic" preset).
  - $\alpha = 1.0$ (Pink Noise).
  - $\alpha = 2.0$ (Brown Noise).
  - $\alpha = 3.0$ (Red Noise, "Sleep Onset" preset).
- In the code:
  - If $\alpha \le 1.0$: `alpha - 1 <= 0` $\implies$ `blend = 0`. **White noise ($\alpha = 0.5$) generates 100% Pink Noise! White noise cannot be produced.**
  - If $\alpha \ge 2.0$: `alpha - 1 >= 1` $\implies$ `blend = 1`. **Red noise ($\alpha = 2.5 - 3.0$) generates 100% Brown Noise! Red noise cannot be produced.**
  - The spectrum generator is completely locked to interpolating only between Pink and Brown, discarding half of the defined psychological states.

---

### 6.5 Flaw 4.5: Omission of Harmonic Stacking Multiplier ($i \bmod 4$) on Distributed Nodes
- `ARCHITECTURE_BLUEPRINT.md` Section 2 and `PHASE2_IMPLEMENTATION_PLAN.md` Section 6 require:
  $$f_{local}(i) = f_{base} \times (harmonic\_ratio)^{i \bmod 4}$$
- In `server.js` and `ModeEngine.js` line 59, the server correctly transmits `myIndex: index`.
- In `public/app.js` lines 150 & 173:
  `const initialFreq = currentV.f_base * currentV.harmonic_ratio;`
  `const targetFreq = currentV.f_base * currentV.harmonic_ratio;`
- **`myIndex` is completely ignored**. Every node in the room plays the exact same harmonic multiple ($f_{base} \times r_h$).
- **Impact**: The distributed chordal harmony that forms the core aesthetic of HealingNodes does not exist in the client implementation; the room collapses into a single unison frequency.

---

### 6.6 Flaw 4.6: AudioContext Suspension and Lifecycle Crash
- In `public/app.js`:
  - `initMediaEngine()` sets `window.theaterDest = crossover`.
  - In `socket.on('media_action')`:
    ```javascript
    if (state.action === 'play') {
        if (!mediaBuffer && state.url) await loadMediaBuffer(state.url);
        scheduleMediaPlayback(state.targetSyncTime);
    }
    ```
  - If an admin triggers "Play" before the client user has clicked "Enter Theater":
    1. `window.theaterDest` is `undefined`.
    2. `finalMix.connect(window.theaterDest)` executes.
    3. The browser throws `TypeError: Failed to execute 'connect' on 'AudioNode': parameter 1 is not of type 'AudioNode'`.
    4. The audio engine crashes permanently.

---

### 6.7 Flaw 4.7: AudioParam Parameter Scheduling Lag and Accumulation
In `scheduleModeUpdate` (lines 169–178):
```javascript
let tDelta = state.targetSyncTime - serverTimeOffset - Date.now();
if (tDelta < 0) tDelta = 0;
const t = audioCtx.currentTime + (tDelta / 1000) + 0.1;
const targetFreq = currentV.f_base * currentV.harmonic_ratio;

baseOsc.frequency.setTargetAtTime(targetFreq, t, 2.0);
binauralOsc.frequency.setTargetAtTime(targetFreq + currentV.binaural_offset, t, 2.0);
```
- Server broadcasts `targetSyncTime = Date.now() + 2500` every 1 second.
- `t` is scheduled $2.6\text{ seconds}$ in the future.
- Because `cancelScheduledValues` is not called, scheduled exponential ramps accumulate in the Web Audio event queue.
- Furthermore, because the visual engine updates canvas colors and pulse frequencies immediately upon socket packet receipt (`currentV = state.v`), the visual display changes **2.6 to 5 seconds before the audio pitch finishes gliding**, breaking audiovisual synchrony.

---

## 7. Synthesis & Prioritized Remediation Roadmap

The following prioritized fixes must be applied to `public/app.js` by the engineering implementation agent:

```
Priority 1 (Critical): Mid/Side Decoding & Multi-Node Phase Correction
- Replace mono finalMix with dual-channel stereo decoding (L = M + S, R = M - S) using ChannelMergerNode.
- Correct spatial dipole radiation: S_node = S * sin(baseNodeAngle).
- Fix rear node center bleed by removing Math.abs(Math.cos) and using proper directional weighting.

Priority 2 (Critical): Signal Graph & Grounding Oscillator Topology
- Restore independent baseOsc connected to panner3D (HRTF).
- Reconnect binauralOscL / binauralOscR pair exclusively to ChannelMergerNode bypassing panner.
- Add 2kHz lowpass BiquadFilterNode between noiseNode and breathingFilter.

Priority 3 (High): Linkwitz-Riley Crossover Implementation
- Replace single 2nd-order highpass with 4th-order Linkwitz-Riley (cascaded dual BiquadFilters, Q=0.7071) or 2nd-order LR (Q=0.5).
- Remove 350Hz allpass from PC nodes. Implement paired lowpass for sub/desktop nodes.

Priority 4 (High): True Brickwall Limiting & Master Dynamics
- Insert lookahead DelayNode (3ms) and WaveShaperNode tanh soft-clipper ceiling before audioCtx.destination in both Core 1 and Core 2.
- Soften compressor knee to 3.0dB and adjust release to 50ms to prevent low-frequency harmonic distortion.

Priority 5 (Medium): AudioWorklet & Spatial Corrections
- Allocate per-channel filter states in SpectralNoiseProcessor.
- Correct alpha blending math to support White (alpha < 1) and Red (alpha > 2).
- Fix HRTF panner coordinate chirality: x = r * sin(theta), z = -r * cos(theta).
- Restore per-node harmonic frequency stacking: f_base * (harmonic_ratio ** (myIndex % 4)).
- Add defensive lifecycle guards around window.theaterDest and audioCtx.resume().
```

---
*End of Audit Report.*
