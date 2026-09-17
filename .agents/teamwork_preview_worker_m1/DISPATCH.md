## 2026-09-17T21:07:01Z

You are the DSP Worker for Milestone 1 in the HealingNodes project.
Your working directory is: /data/data/com.termux/files/home/Projects/HealingNodes/.agents/teamwork_preview_worker_m1/
Your parent conversation ID is: 634d7488-2df3-4eef-b42d-f35a66fcd938

MANDATORY FIRST STEP:
1. Read /data/data/com.termux/files/home/Projects/HealingNodes/ORIGINAL_REQUEST.md.
2. Read /data/data/com.termux/files/home/Projects/HealingNodes/PROJECT.md.
3. Read /data/data/com.termux/files/home/Projects/HealingNodes/.agents/teamwork_preview_explorer_dsp/dsp_audit_report.md.
4. Read /data/data/com.termux/files/home/Projects/HealingNodes/.agents/teamwork_preview_explorer_dsp/handoff.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

SCOPE & EXCLUSIVE FILE OWNERSHIP:
You exclusively own and modify `public/app.js`. Do NOT modify `server.js` or files in `src/`.

MISSION:
Implement all Web Audio DSP architecture fixes in `public/app.js` as detailed in `dsp_audit_report.md`:
1. Mid/Side Phase Extraction & Stereo Matrix Decoding:
   - Correct M/S extraction: $M = (L + R) * 0.5$, $S = (L - R) * 0.5$ using ChannelSplitter and inverting GainNodes.
   - Implement discrete stereo reconstruction matrix using `ChannelMergerNode(2)` ($L = M + S$, $R = M - S$) instead of downmixing to mono.
   - Correct acoustic polarity inversion for right-side nodes: for $\theta \approx 3\pi/2$, use inverted Side ($-S = (R - L)/2$) so room soundstage dipole is physically correct.
   - For rear nodes ($\theta \approx \pi$), apply front-to-rear surround attenuation on Mid ($M$) to eliminate front dialogue bleed.
2. Butterworth / Linkwitz-Riley Crossover Network:
   - Implement 4th-order Linkwitz-Riley crossover (cascading two 2nd-order Butterworth filters with $Q=0.7071$) or 2nd-order critically damped filters ($Q=0.5$) with matched phase to prevent comb filtering and destructive interference.
   - Mobile/tablet devices: highpass cutoff at 150 Hz to prevent micro-speaker excursion damage.
   - Desktop/TV devices: highpass cutoff at 40 Hz (replace unconfigured allpass).
   - Ensure Mode Engine algorithmic synthesis (e.g. 33 Hz / 40 Hz sines) also routes through the crossover and excursion protection limiter.
3. Brickwall Limiters:
   - Configure `DynamicsCompressorNode` (threshold -0.5 dBFS, ratio 20:1, knee 0.5, fast attack 0.001s, release 0.05s) and/or WaveShaper soft-clipping ceiling to strictly prevent clipping and transient overshoot without audible pumping.
   - Ensure BOTH Theater Core and Mode Engine pass through the limiter before `audioCtx.destination`.
4. DSP Signal Graph & Spatial Routing:
   - Connect `baseOsc` into the 3D HRTF panner and circadian gain stage rather than hard-panning into binaural Left.
   - Fix 3D HRTF listener orientation coordinates ($x, y, z$).
   - Ensure noise worklet incorporates 2 kHz lowpass filter and 0.55 gain scaling.
   - Implement node harmonic chord multiplier ($f_{base} \times r_h^{i \bmod 4}$) using the node's assigned `myIndex` so multi-node setups form harmonic chords instead of unison droning.
   - Guard `window.theaterDest` and AudioContext initialization against uninitialized invocation on network play.

VERIFICATION:
Run `python ~/.gemini/config/skills/qa-analyzer/scripts/analyzer.py .` to ensure 0 structural or syntax errors.

DELIVERABLES:
1. Updated `public/app.js`.
2. Write a detailed implementation report and `handoff.md` in your working directory.
3. Notify parent via send_message when complete.
