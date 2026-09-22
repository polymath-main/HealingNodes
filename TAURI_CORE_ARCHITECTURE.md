# Phase 3: HealingNodes Tauri Core Architecture

## 1. Executive Summary & Objective

The "HealingNodes" architecture has been fully redesigned for Phase 3. All legacy dependencies on Node.js, WebRTC, and Electron have been strictly deprecated. The system now utilizes a **Tauri (Rust + Web)** technology stack. 

The primary objective is to achieve sub-millisecond, phase-aligned local network audio streaming across distributed devices (phones, TVs, secondary PCs) originating from a single Host. To circumvent browser DRM restrictions and echo feedback loops, the host system leverages a Native Rust Backend combined with an OS-level Virtual Audio Cable, while seamlessly feeding into the existing spatial and circadian DSP pipeline on the client nodes.

## 2. Technology Stack

### 2.1 Backend / Core (The Universal Stream Engine)
- **Framework**: Tauri (Rust)
- **Audio Capture**: `cpal` (Cross-Platform Audio Library for raw PCM capture via ALSA/WASAPI/CoreAudio).
- **Audio Encoding**: `opus` (Rust bindings for libopus) for ultra-low latency, full-spectrum audio encoding.
- **Async Runtime & Networking**: `tokio` for async concurrency, paired with `tokio-tungstenite` for highly performant raw WebSocket communication.
- **Network Discovery**: `local-ip-address` to resolve the host's LAN IP for QR code generation.
- **Serialization**: `serde` and `serde_json` for the Microkernel API SDK.

### 2.2 Frontend (Host UI & Remote Nodes)
- **Host UI**: A lightweight, stripped-down Tauri web frontend (Vanilla JS/React) acting purely as a command-and-control interface. Its primary UI function is rendering the connection QR Code.
- **Remote Nodes (Web Clients)**: Static Web Clients (running in mobile/TV browsers) decoding Opus via WebCodecs and routing the audio through the HealingNodes Web Audio DSP graph.

## 3. The Microkernel Pattern (Universal Stream Engine)

The Rust backend is isolated as a "Black Box" microkernel. The frontend has zero direct access to the audio stream or the networking sockets.

### Core Threads / Tasks:
1. **Audio Capture Thread**: A dedicated high-priority system thread running the `cpal` input stream, continuously ingesting PCM float32/int16 chunks from the Virtual Audio Cable.
2. **Encoder Task**: Compresses the raw chunks using the `opus` crate (configured for `Application::Audio` to preserve the full frequency spectrum required for spatial processing).
3. **Network (WebSocket) Task**: A `tokio-tungstenite` async server that manages connections from Remote Nodes, handles NTP synchronization pings, and broadcasts binary Opus chunks.

## 4. Audio Routing, Data Flow, & DSP Integration

### 4.1 Host-Side Capture
1. **Virtual Audio Cable Setup**: The user installs a Virtual Audio Cable (e.g., VB-Cable) and sets it as the default OS output device.
2. **Raw PCM Ingestion**: The Rust backend attaches to this Virtual Cable's output stream using `cpal`, capturing 100% of system audio without microphone echo feedback loops.

### 4.2 Network Transmission (WebSockets)
WebRTC is deprecated. All data flows over a local Raw WebSocket connection (`ws://<HOST_IP>:<PORT>`).
- **NTP Sync**: Clients continuously ping the WebSocket for sub-millisecond clock offset calculations ($t_0, t_1, t_2, t_3$ round-trip math).
- **Binary Payloads**: Audio is sent as binary blobs:
  - `[0..8 bytes]`: 64-bit absolute capture timestamp (NTP synchronized network time).
  - `[8..N bytes]`: Opus encoded frame data.

### 4.3 Node-Side Playback & Healing DSP Pipeline
Remote nodes receive the binary stream and integrate it into the existing biophysical matrix:
1. **Decoding**: The Node extracts the timestamp and decodes the Opus frame via the WebCodecs API.
2. **Phase Alignment**: The node calculates absolute playback time: 
   `PlaybackTime = CaptureTimestamp + JitterDelay (e.g., 500ms)`
3. **DSP Graph Application**: The decoded chunk is not played directly. It is routed into the existing Web Audio architecture:
   - **Stereo Decoding**: Passed through the Mid/Side Phase Extraction matrix ($M = (L+R)/2, S = (L-R)/2$).
   - **Circadian Integration**: Mixed with the `ModeEngine` (33Hz Isochronic pulses and 1/f Pink Noise).
   - **Spatialization**: Spatialize via 3D HRTF Panner based on Quadtree mathematics ($\theta_i = \frac{2\pi \cdot i}{N}$).
   - **Protection**: Sent through the Brickwall Ceiling limiter.
4. **Execution**: The final composite audio node is scheduled to execute exactly at `PlaybackTime`, guaranteeing perfect acoustic phase alignment across the physical room.

## 5. Microkernel API Structure (Tauri Commands SDK)

The Tauri frontend ONLY controls the Rust backend via a strict Command SDK (Tauri `invoke`).

### 5.1 Control Commands
* `invoke("engine_init") -> Result<(), String>`: Boots the async runtime, prepares memory buffers.
* `invoke("get_network_info") -> Result<{ ip: String, port: u16 }, String>`: Fetches the Host's LAN IP address and active WebSocket port to render the onboarding QR Code on the UI.
* `invoke("get_audio_devices") -> Result<Vec<AudioDevice>, String>`: Probes `cpal` to list available inputs (allowing selection of VB-Cable).
* `invoke("set_target_device", { device_id: String }) -> Result<(), String>`: Locks the capture engine to the specified device.
* `invoke("start_stream") -> Result<(), String>`: Activates the `cpal` stream, the `opus` encoder, and begins WebSocket broadcasting.
* `invoke("stop_stream") -> Result<(), String>`: Halts capture and broadcasting.

### 5.2 Configuration & Tuning Commands
* `invoke("set_jitter_delay", { delay_ms: u32 }) -> Result<(), String>`: Dynamically adjusts the target buffer delay.
* `invoke("set_network_port", { port: u16 }) -> Result<(), String>`: Configures the local WebSocket port.

### 5.3 Asynchronous Events (Rust -> Frontend)
The frontend passively listens to backend state changes via Tauri Events:
* `on("engine_status", (status) => {...})`: Emits "idle", "streaming", or "error".
* `on("node_connected", (ip) => {...})`: Updates the UI when a new Remote Node joins the WebSocket pool.
* `on("sync_metrics", (metrics) => {...})`: Streams debug data (connected count, avg latency, jitter buffer health).
