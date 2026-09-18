# Phase 5: WebRTC Rust Hybrid Architecture

## 1. System Overview
Phase 5 transforms HealingNodes from a Node.js/Socket.io chunk-buffered system into a hyper-low-latency, zero-GC WebRTC ecosystem powered by Rust and WebAssembly.

## 2. Network Topology: The "AirPods" Model
- **Host PC (The Broadcaster):** Computes and captures audio locally using `audioCtx.createMediaStreamDestination()` or screen capture (`navigator.mediaDevices.getDisplayMedia`). It processes the master spatialization and sends a single, low-latency WebRTC Opus stream to the SFU.
- **Phones (Dumb Receivers):** Act merely as playback endpoints (like AirPods). They connect via WebRTC, receive the raw stream, and pass it immediately to the local AudioContext without downloading chunks or maintaining complex Node.js sync buffers.
- **Signaling & SFU (Rust Backend):** A lightweight Rust server negotiates WebRTC connections (SDP offers/answers) and relays the Opus packets from the Host PC to all connected receiver phones simultaneously.

## 3. Server & Backend (Rust)
- **Framework:** Rust using `tokio` for async I/O and `tokio-tungstenite` for WebSocket signaling.
- **WebRTC SFU:** Utilizing `webrtc-rs` (or a similar Rust WebRTC stack) to act as a Selective Forwarding Unit.
- **Role:** Handles room state, ICE candidate routing, and efficient multi-cast packet forwarding from the Host PC to N clients without server-side audio transcoding.

## 4. Audio DSP (Rust -> WASM AudioWorklet)
- **Elimination of JS Garbage Collection:** JavaScript `AudioNode`s and raw JS DSP suffer from V8 garbage collection pauses which disrupt spatial coherence.
- **WASM Implementation:** The Linkwitz-Riley crossovers and Mode Engine math are rewritten in `no_std` Rust and compiled to WebAssembly using `wasm-bindgen`.
- **AudioWorklet Integration:** The compiled `.wasm` binary is loaded into a browser `AudioWorkletProcessor`. The incoming WebRTC audio track is piped into this Worklet, where the zero-GC Rust DSP applies mathematically flawless filtering and hardware protection (excursion limiting) on a per-sample basis before routing to the physical speaker.

## 5. Visuals (WebGL Fragment Shaders)
- **Current State:** 2D Canvas rendering, CPU-heavy.
- **Phase 5 State:** Pure WebGL (GLSL) Fragment Shaders (`webgl2`).
- **GPU Integration:** The WASM AudioWorklet (or a parallel `AnalyserNode`) extracts frequency domain data (FFT) and passes it to the main thread via `MessagePort`. The main thread pushes this data to the GPU via Uniform Arrays or a 1D Data Texture. The fluid/liquid visuals are computed entirely on the GPU, fully decoupling the visual frame rate from DSP performance.

## 6. Project Structure & Migration Path
**Proposed Rust Workspace Layout:**
- `/server/` (Rust Cargo Workspace: Tokio WebSockets, WebRTC SFU)
- `/dsp-wasm/` (Rust Library: `wasm-bindgen` crossover logic, compiled to `pkg/`)
- `/client/` (Frontend JS/GLSL: WebRTC client, AudioWorklet wrappers, WebGL shaders)

## 7. Unified UX & Floating Interface (Phase 4 Merge)
Phase 5 incorporates the UX/UI overhaul defined in Phase 4:
- **Deprecation of Admin Panel:** `admin.html` is completely deleted. The control system is seamlessly integrated into the unified `index.html` Daydream environment.
- **Floating Action Button (FAB):** A sleek, animated circular button anchored to the bottom-right of the canvas.
- **Glassmorphic Navigation:** Clicking the FAB expands a hardware-accelerated CSS navigation bar containing:
  1. The Core Toggle (Mode vs. Media).
  2. The Mode Preset Selector (Scrolling list of frequencies).
  3. The Config Panel (Media upload and volume controls).
- **Audio-Reactive Symbiosis:** The FAB UI rests transparently on top of the raw WebGL liquid shaders, ensuring the user never has to leave the immersive environment to change settings.

*Note: Phase 5 replaces the Phase 3 Node.js server entirely. Backwards compatibility is not maintained; this is a clean rewrite of the networking and DSP layers while preserving the theoretical spatial concepts outlined in previous phases.*

## 8. WebRTC Autoplay Bypass Strategy

### 8.1 The Asynchronous Autoplay Challenge
Modern mobile browsers (especially iOS Safari) enforce strict autoplay policies requiring a synchronous user gesture (like a `click`) to begin media playback. In a WebRTC pipeline, remote audio tracks arrive asynchronously via the `RTCPeerConnection.ontrack` event. If we attempt to attach this newly arrived stream to an `<audio>` element outside of the initial click handler's execution context, the browser typically blocks it with a `NotAllowedError`.

### 8.2 Why the "Pre-Warmed src" Anti-Pattern Fails
A common misconception is that playing a silent MP3 file via the `src` attribute during the user gesture will permanently "unlock" the `<audio>` element, allowing a later swap to `srcObject = stream`. **This is an anti-pattern on modern iOS Safari.** Swapping a media element's source from a file (`src`) to a real-time stream (`srcObject`) resets its internal state and re-triggers the autoplay policy evaluation, causing the asynchronous WebRTC stream to be blocked.

### 8.3 Bulletproof Implementation Strategies

To reliably bypass or handle this block, implement one (or a combination) of the following proven patterns:

#### Strategy A: The `getUserMedia` Active Session Unlock (Recommended for 2-Way Calls)
If your architecture involves the user speaking (2-way audio), the most robust solution is to request microphone access during the initial "Join" click.
1. **Synchronous Capture:** On the initial user click, call `navigator.mediaDevices.getUserMedia({ audio: true })`.
2. **Policy Relaxation:** iOS Safari recognizes this as an active, user-approved media capture session. This globally relaxes the autoplay policies for the domain.
3. **Seamless Autoplay:** When the asynchronous `ontrack` event fires later, assigning `audio.srcObject = stream` and calling `.play()` will succeed without a secondary user gesture.

#### Strategy B: The `AudioContext` Routing Bypass (Recommended for 1-Way / Receive-Only)
If the application is receive-only and prompting for microphone permissions is poor UX, we can bypass the HTMLMediaElement entirely using the Web Audio API.
1. **Synchronous Unlock:** On the initial "Join" click, create an `AudioContext` and synchronously call `audioContext.resume()`. This permanently unlocks the audio context.
2. **Asynchronous Routing:** When the `ontrack` event fires, wrap the track in a `MediaStream`, create a source node, and connect it to the destination.
*(Warning: This bypasses the browser's hardware Acoustic Echo Cancellation (AEC), so it should strictly be used for receive-only scenarios or when users wear headphones).*

#### Strategy C: The "Catch and Tap" Fallback (Mandatory Safety Net)
Regardless of the strategy used, edge cases like **iOS Low Power Mode** enforce strict autoplay blocks that cannot be bypassed. You must always implement a state-driven fallback.
1. When assigning `srcObject` in `ontrack`, always call `.play()` and catch the promise rejection.
2. If a `NotAllowedError` is caught, render a "Tap to Unmute/Play" UI overlay.
3. When the user taps the overlay, call `.play()` inside that specific click handler to definitively satisfy the policy.
