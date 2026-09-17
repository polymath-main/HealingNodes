# Handoff Report — Web Audio DSP Architecture Audit

**Agent**: DSP Codebase Explorer  
**Working Directory**: `/data/data/com.termux/files/home/Projects/HealingNodes/.agents/teamwork_preview_explorer_dsp/`  
**Parent Conversation ID**: `634d7488-2df3-4eef-b42d-f35a66fcd938`  
**Date**: 2026-09-17  
**Type**: Hard Handoff (Investigation & Audit Complete)

---

## 1. Observation

Direct observations from `public/app.js` and architectural documents:

1. **Mid/Side Routing in `public/app.js` (lines 220–241)**:
   - Line 220–229:
     ```javascript
     const splitter = audioCtx.createChannelSplitter(2);
     mediaSource.connect(splitter);

     const midMix = audioCtx.createGain(); midMix.gain.value = 0.5; // (L+R)/2
     splitter.connect(midMix, 0); splitter.connect(midMix, 1);

     const sideMix = audioCtx.createGain(); sideMix.gain.value = 0.5; // (L-R)/2
     const invertGain = audioCtx.createGain(); invertGain.gain.value = -1.0;
     splitter.connect(sideMix, 0); 
     splitter.connect(invertGain, 1); invertGain.connect(sideMix);
     ```
   - Line 232–241:
     ```javascript
     const mixRatio = Math.abs(Math.cos(baseNodeAngle)); // 0 rad = 1 (Mid). PI/2 rad = 0 (Side)
     const finalMix = audioCtx.createGain();
     
     const applyMid = audioCtx.createGain(); applyMid.gain.value = mixRatio;
     const applySide = audioCtx.createGain(); applySide.gain.value = 1.0 - mixRatio;
     
     midMix.connect(applyMid); applyMid.connect(finalMix);
     sideMix.connect(applySide); applySide.connect(finalMix);
     
     finalMix.connect(window.theaterDest); // Route to crossover & limiter
     ```
   - `finalMix` is a single-channel mono GainNode summing scalar multiples of Mid and Side. There is no `ChannelMergerNode` or stereo decoding matrix.
   - For a node at angle $\theta = \frac{3\pi}{2}$ ($270^\circ$ / Right), $\cos(\frac{3\pi}{2}) = 0 \implies \text{mixRatio} = 0 \implies \text{applySide} = 1.0$. The right node plays $+S = (L - R)/2$ instead of $-S = (R - L)/2$.
   - For a node at angle $\theta = \pi$ ($180^\circ$ / Rear), $|\cos(\pi)| = |-1| = 1.0 \implies \text{applyMid} = 1.0$. The rear surround node plays 100% front-center dialogue.

2. **Crossover Filtering in `public/app.js` (lines 185–194)**:
   - Lines 185–193:
     ```javascript
     const isPhone = window.innerWidth < 768;
     const crossover = audioCtx.createBiquadFilter();
     if (isPhone) {
         crossover.type = "highpass";
         crossover.frequency.value = 150; // Protect phone speakers
         crossover.Q.value = 0.707; // Butterworth
     } else {
         crossover.type = "allpass"; // Let subs through
     }
     ```
   - Phone runs a single 2nd-order highpass filter. Desktop/TV runs an allpass filter with default frequency 350 Hz. Low frequencies are discarded rather than split.

3. **Limiter in `public/app.js` (lines 196–201)**:
   - Lines 196–198:
     ```javascript
     const limiter = audioCtx.createDynamicsCompressor();
     limiter.threshold.value = -1.0; limiter.knee.value = 0.0; limiter.ratio.value = 20.0;
     limiter.attack.value = 0.002; limiter.release.value = 0.100;
     ```
   - No lookahead buffer. Max ratio is 20:1.
   - Core 1 (`initModeEngine()`, line 137) has `masterGain.connect(audioCtx.destination)` with no compressor or limiter at all.

4. **Mode Engine Signal Graph in `public/app.js` (lines 139–153)**:
   - Lines 146–152:
     ```javascript
     baseOscGain.connect(merger, 0, 0); // L
     binOscGain.connect(merger, 0, 1);  // R
     ...
     baseOsc.connect(baseOscGain); binauralOsc.connect(binOscGain);
     ```
   - `baseOsc` is routed exclusively to the Left channel of `merger` and is never spatialized via `panner3D`.

5. **AudioWorklet Noise Processor in `public/app.js` (lines 27–42)**:
   - Lines 27–41:
     ```javascript
     for (let channel = 0; channel < output.length; ++channel) {
         const outChannel = output[channel];
         for (let i = 0; i < outChannel.length; ++i) {
             ...
             let blend = Math.max(0, Math.min(1, alpha - 1));
             outChannel[i] = pink * (1 - blend) + (this.brown * 3.5) * blend;
         }
     }
     ```
   - `this.b0`..`this.b6` and `this.brown` are shared across channels. For $\alpha \le 1$, `blend = 0` (White noise cannot be produced). For $\alpha \ge 2$, `blend = 1` (Red noise cannot be produced).

6. **Panner 3D Coordinates in `public/app.js` (lines 271–272)**:
   - `panner3D.positionX.setValueAtTime(2 * Math.cos(currentAngleRads), time);`
   - `panner3D.positionZ.setValueAtTime(2 * Math.sin(currentAngleRads), time);`
   - Angle 0 maps to $(2, 0, 0)$ (listener's Right ear), rotating spatial orbit by $90^\circ$ from Front Center.

7. **Harmonic Stacking in `public/app.js` (lines 150 & 173)**:
   - `const initialFreq = currentV.f_base * currentV.harmonic_ratio;`
   - `const targetFreq = currentV.f_base * currentV.harmonic_ratio;`
   - Multiplier `(harmonic_ratio ** (myIndex % 4))` specified in blueprints is absent; `myIndex` is ignored.

---

## 2. Logic Chain

1. **Mid/Side Logic**:
   - Observation 1 demonstrates `finalMix` is a mono sum.
   - W3C spec states connecting a mono node to a 2-channel destination duplicates the signal to both channels.
   - Therefore, devices play dual-mono, completely destroying stereo width.
   - Observation 1 shows `mixRatio = Math.abs(Math.cos(baseNodeAngle))`.
   - At $\theta = \frac{3\pi}{2}$ (Right), `mixRatio = 0`, producing $+S = (L - R)/2$.
   - In dipole physics, Right radiation must be $-S = (R - L)/2$.
   - Therefore, right-side nodes emit inverted polarity for the right channel and positive polarity for the left channel, inverting soundstage localization across the room.

2. **Crossover Logic**:
   - Observation 2 demonstrates phone runs a 2nd-order highpass at 150 Hz ($Q=0.707$) while PC runs an allpass at 350 Hz.
   - Summing independent signals with mismatched phase transfer functions in an acoustic room induces frequency-dependent constructive and destructive wave interference.
   - Standard 2nd-order Butterworth filters sum to a null ($-\infty\text{ dB}$) when in-phase, or $+3.01\text{ dB}$ peak when inverted at crossover.
   - Therefore, flat acoustic magnitude response requires Linkwitz-Riley alignment (cascaded 2nd-order Butterworth $Q=0.7071$ or critically damped $Q=0.5$).

3. **Limiter Logic**:
   - Observation 3 shows `limiter` is a `DynamicsCompressorNode` with ratio 20:1 and 2ms attack.
   - Web Audio compressors lack lookahead buffers; transients faster than 2ms pass without attenuation.
   - Signals exceeding threshold by $>20\text{ dB}$ will exceed $0\text{ dBFS}$ even after compression.
   - Observation 3 shows Core 1 lacks any limiter.
   - Therefore, transients and hot signals produce digital clipping. A true limiter requires lookahead plus soft-clipping waveshaping.

4. **Signal Graph & Worklet Logic**:
   - Observation 4 shows `baseOsc` hard-panned into Left channel of `merger` instead of `panner3D`.
   - Blueprint Section 2 defines `baseOsc` as the room grounding tone and a separate gated binaural pair.
   - Therefore, the grounding tone is missing from the spatial soundfield and corrupts the binaural beat.
   - Observation 5 shows Worklet filter state variables are reused across output channels and $\alpha$ blending is clamped to $[1, 2]$.
   - Therefore, multi-channel state corrupts audio and White/Red noise states are unachievable.

---

## 3. Caveats

- **No Caveats**: All relevant files (`public/app.js`, `ARCHITECTURE_BLUEPRINT.md`, `THEORY.md`, `PHASE2_IMPLEMENTATION_PLAN.md`, `PHASE3_THEATER_ARCHITECTURE.md`, `server.js`, `src/core/MediaEngine.js`, `src/core/ModeEngine.js`) were fully inspected.
- The investigation is strictly read-only per constraints; no source code files outside of `.agents/` were modified.

---

## 4. Conclusion

`public/app.js` fails across all four primary DSP evaluation categories:
1. Mid/Side processing fails due to mono downmixing, right-channel polarity inversion, and rear dialogue bleed.
2. Crossover design fails because it is an asymmetric highpass/allpass configuration rather than a Linkwitz-Riley crossover.
3. Limiter design fails to prevent clipping on transients and is completely omitted from Core 1.
4. Spatial panner coordinates are rotated $90^\circ$, grounding oscillators are misrouted, the noise worklet corrupts multi-channel state, and per-node harmonic chord stacking is omitted.

The complete mathematical analysis, proofs, and before-and-after implementation specifications are documented in `dsp_audit_report.md`.

---

## 5. Verification Method

To independently verify these findings:
1. **Source Code Inspection**:
   - View `public/app.js` lines 220–241 to confirm mono `finalMix` and `Math.abs(Math.cos)` formulation.
   - View `public/app.js` lines 185–194 to confirm `type = "allpass"` without frequency setting.
   - View `public/app.js` lines 146–152 to confirm `baseOscGain` connected to `merger, 0, 0`.
   - View `public/app.js` lines 27–42 to confirm `blend = Math.max(0, Math.min(1, alpha - 1))`.
2. **QA Analyzer Tool**:
   - Run Universal QA Analyzer smoke test:
     ```bash
     python ~/.gemini/config/skills/qa-analyzer/scripts/analyzer.py /data/data/com.termux/files/home/Projects/HealingNodes/public
     ```
3. **Mathematical Validation**:
   - Evaluate $P(\theta) = M + S \cdot \sin(\theta)$ vs. $M \cdot |\cos(\theta)| + S \cdot (1 - |\cos(\theta)|)$ at $\theta = 0, \frac{\pi}{2}, \pi, \frac{3\pi}{2}$.
   - Evaluate Butterworth vs. Linkwitz-Riley transfer functions at $s = j\omega_0$.
