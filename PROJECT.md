# Project: HealingNodes Dual-Core Structural, DSP, and Architectural Audit

## Architecture
HealingNodes is a distributed spatial audio and circadian entrainment platform composed of:
1. **Theater Core**: Distributed surround audio system using Web Audio API in client browsers (`public/app.js`). Nodes act as spatial speakers arranged in a circle, receiving audio streams or synthetic cues, applying Mid/Side matrix decoding, Butterworth/Linkwitz-Riley crossovers based on hardware capability, and 3D HRTF spatialization.
2. **Mode Engine (Circadian / Healing Core)**: Algorithmic frequency generator producing binaural beats, isochronic pulses, and solfeggio/sacred frequency chords stacked harmonically across distributed nodes.
3. **Network Synchronization Engine**: Socket.io + NTP clock synchronization layer (`server.js`, `src/core/MediaEngine.js`, `public/app.js`) maintaining sub-millisecond phase alignment and synchronized spatial trajectory interpolation across all connected devices.

## Code Layout
- `public/app.js`: Client-side Web Audio DSP graph, Mid/Side matrix, crossover filters, limiters, HRTF panner, NTP client sync, trajectory animation.
- `server.js`: Express + Socket.io server, NTP timestamp responder, room/mesh state manager, REST endpoints.
- `src/core/MediaEngine.js`: Server-side media state, stream orchestration, playhead tracking, late-join sync payload builder.
- `src/core/ModeEngine.js`: Algorithmic mode synthesis parameters, circadian cycle schedules.
- `tests/`: Automated 4-tier E2E and unit test suite (`node:test`).
- `PROJECT.md`: Project architecture, feature inventory, and milestone tracking.
- `TEST_INFRA.md`: E2E test suite methodology and specification.
- `TEST_READY.md`: Signal that test suite is complete and ready.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | M/S Phase Extraction & Stereo Decoding Matrix | Correct $M = (L+R)/2$ and $S = (L-R)/2$ routing with discrete ChannelMerger stereo reconstruction ($L = M+S, R = M-S$), inverted polarity ($-S$) for right-perimeter nodes ($\theta=3\pi/2$), and front-to-rear surround attenuation. | M1 | ORIGINAL_REQUEST §R1, dsp_audit_report.md |
| 2 | Butterworth / Linkwitz-Riley Crossovers | Hardware-matched crossovers: 4th-order Linkwitz-Riley or properly tuned 2nd-order filters with flat sum magnitude/phase; 150Hz highpass for mobile/tablets, 40Hz highpass for desktop/TV; ensure Mode Engine passes through crossover. | M1 | ORIGINAL_REQUEST §R1, dsp_audit_report.md |
| 3 | Brickwall Ceiling & Excursion Limiters | True ceiling limiting for Theater Core and Mode Engine (protecting small phone speakers from 33Hz sub-bass excursion) without clipping, transient overshoot, or pumping. | M1 | ORIGINAL_REQUEST §R1, dsp_audit_report.md |
| 4 | DSP Signal Graph & Spatial Routing Integrity | Re-route `baseOsc` into 3D HRTF panner, correct 3D listener orientation coordinates, add 2kHz lowpass filter on noise generator, enable node harmonic chord multiplier ($f_{base} \times r_h^{i \bmod 4}$). | M1 | dsp_audit_report.md, spec_qa_report.md |
| 5 | AudioContext & Destination Guarding | Guard against uninitialized `window.theaterDest` crashes when network triggers play before user interaction; eliminate AudioNode memory leaks on stream switch. | M1 | dsp_audit_report.md, spec_qa_report.md |
| 6 | NTP Clock Synchronization & Jitter Robustness | Full 4-timestamp NTP calculation ($t_0, t_1, t_2, t_3$) with server turnaround time, minimum-RTT sliding window filtering, periodic drift resync, and clean reconnect offset reset. | M2 | ORIGINAL_REQUEST §R2, network_sync_report.md |
| 7 | Late-Joining Clients & Playhead Sync | Track playback start time and current offset in `MediaEngine.js`; emit targeted sync/play payload with exact seek offset to late-joining client without disrupting active nodes; client computes elapsed time and seeks ($start(currentTime, elapsed)$) if $tDelta < 0$. | M2 | ORIGINAL_REQUEST §R2, network_sync_report.md |
| 8 | Trajectory & Spatial Math Interpolation | Sync orbital trajectory to synchronized network epoch time; clamp smoothstep bounds ($progress \in [0, 1]$); handle $durationMs = 0$; fix $\phi_{color}$ circular shortest-arc interpolation; prevent vector mutation bugs. | M2 | ORIGINAL_REQUEST §R2, network_sync_report.md |
| 9 | REST Endpoints & Concurrency Cleanup | Implement `GET /api/state` in `server.js`; clean up duplicate socket IDs in `nodes` mesh on reconnect; prevent `ModeEngine` interval leaks; add stream abort cleanup in `YouTubeProxy.js`. | M2 | network_sync_report.md, spec_qa_report.md |
| 10 | E2E & Unit Test Infrastructure (Tiers 1-4) | Native `node:test` suite covering DSP math, Web Audio graph mock, socket.io NTP/sync simulation, and cross-core E2E workflows. | M-E2E | spec_qa_report.md |
| 11 | Universal Offline QA Compliance | Verify `python ~/.gemini/config/skills/qa-analyzer/scripts/analyzer.py .` reports 0 syntax/structural errors across entire project. | M3 | ORIGINAL_REQUEST Acceptance Criteria |
| 12 | Agent-as-Judge & Forensic Audit Verification | Independent DSP mathematical audit, adversarial stress testing (Tier 5), forensic integrity check, and clean git commit. | M3 | ORIGINAL_REQUEST Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M-E2E | E2E Test Suite Track | Features #10 (Tiers 1-4 automated tests, TEST_INFRA.md, TEST_READY.md) | none | IN_PROGRESS |
| M1 | Web Audio DSP Architecture Fixes | Features #1, #2, #3, #4, #5 (`public/app.js`) | none | PLANNED |
| M2 | Network Synchronization Orchestration Fixes | Features #6, #7, #8, #9 (`server.js`, `src/core/MediaEngine.js`, `public/app.js`) | none | PLANNED |
| M3 | Final Verification, Adversarial Hardening & Git Commit | Features #11, #12 (100% E2E test pass, Tier 5 hardening, QA Analyzer 0 errors, Agent-as-Judge DSP review, Forensic Audit, Git commit) | M-E2E, M1, M2 | PLANNED |

## Interface Contracts
### Client ↔ Server NTP Sync
- Client emits `sync_ping`: `{ t0: clientSendTimestamp }`
- Server replies `sync_pong`: `{ t0: clientSendTimestamp, t1: serverReceiveTimestamp, t2: serverSendTimestamp }`
- Client calculates:
  - $RTT = (t_3 - t_0) - (t_2 - t_1)$
  - $\theta_{offset} = \frac{(t_1 - t_0) + (t_2 - t_3)}{2}$
  - Jitter filter: sample over window of $N=8$, pick sample with minimum RTT.

### MediaEngine ↔ Client Playhead Synchronization
- Server emits `sync_state`: `{ trackId, isPlaying, serverStartTime, currentOffset, duration }`
- Late-joining client calculates:
  - $now_{synced} = \text{Date.now()} + \theta_{offset}$
  - $\text{elapsed} = (now_{synced} - serverStartTime) / 1000 + currentOffset$
  - Client schedules source: if $\text{elapsed} > 0$, call `source.start(audioCtx.currentTime, elapsed)`.

### Mid/Side Matrix Routing in `public/app.js`
- Mid Channel ($M$): Sum Left + Right scaled by $0.5$.
- Side Channel ($S$): Difference Left - Right (Left + Right with Gain $-1.0$) scaled by $0.5$.
- Position Decoding:
  - Front ($\theta \approx 0$): High Mid ($M$), Low Side ($S$).
  - Left ($\theta \approx \pi/2$): Full $+S$.
  - Right ($\theta \approx 3\pi/2$): Inverted Side ($-S$).
  - Rear ($\theta \approx \pi$): Attenuated Mid ($-6\text{ dB}$ or $-12\text{ dB}$), spatialized Side.
