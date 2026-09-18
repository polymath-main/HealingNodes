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

*Note: Phase 5 replaces the Phase 3 Node.js server entirely. Backwards compatibility is not maintained; this is a clean rewrite of the networking and DSP layers while preserving the theoretical spatial concepts outlined in previous phases.*
