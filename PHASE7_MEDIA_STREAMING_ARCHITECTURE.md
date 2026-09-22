# Phase 7: Synchronized Arbitrary Media Streaming Architecture (Native Desktop + WebSocket)

## 1. Overview & Objective
The goal of Phase 7 is to transition HealingNodes from locally generated synthetic biophysical frequencies to streaming arbitrary media (e.g., a movie, Spotify, or desktop audio) originating from a single Host device to multiple local Node devices (phones, TVs, secondary PCs).

The previous 100% browser-based WebRTC/WebCodecs approach has been abandoned because a browser cannot silently capture system-wide audio without DRM issues or unavoidable audio feedback (echoing). 

The new, vastly superior technical direction leverages a **Native Desktop App Host** over a **Local WebSocket Network**. The core constraint remains absolute sub-millisecond phase-aligned synchronization across all nodes to maintain spatial cohesion.

## 2. Core Architectural Flow

1. **Host (Native Desktop App)**: A native application (built with Rust or Electron) runs on the Host machine. It hooks into the OS audio subsystem or installs a Virtual Audio Cable to seamlessly and silently capture all OS audio.
2. **Network Layer (Local WebSocket)**: The Host app runs a local WebSocket server (e.g., `ws://192.168.1.100:8080`). This completely eliminates the need for WebRTC or public MQTT brokers. The Host generates and displays a QR code containing its local IP address.
3. **Nodes (Static Web Clients)**: Local devices (Phones/TVs) act as Nodes. They simply scan the QR code to open a static Web App (e.g., hosted on GitHub Pages). The Web App connects directly to the local WebSocket server.
4. **Data & Sync Transmission**: The Host encodes the captured audio into chunks (e.g., Opus) and transmits them over the WebSocket, along with NTP-style clock synchronization pings.
5. **Scheduled Playback (Jitter Buffer)**: Both the Host (Desktop App) and the Nodes (Web App) implement a 500ms Jitter Buffer. Audio is scheduled to play exactly at `captureTime + 500ms` using precise audio clocks (such as `AudioContext.currentTime` on the Web Nodes) to guarantee perfect multi-room phase alignment.

## 3. Host System: Capture & Server

### 3.1 Seamless System Audio Capture
Unlike browser-based solutions that struggle with `getDisplayMedia()`, DRM restrictions, and echoing, the Native Host uses direct OS APIs (like CoreAudio, WASAPI, or PulseAudio) or a Virtual Audio Cable. This ensures that *all* system audio is captured flawlessly, without triggering an echo loop. 

### 3.2 Local WebSocket Server
The Host acts as the central hub and time authority. It spins up a lightweight WebSocket server on the local network. By removing WebRTC, we eliminate STUN/TURN overhead, ICE gathering delays, and complex signaling.

### 3.3 QR Code Onboarding
The Host exposes its local network IP and port via a QR code. Any device on the same local network simply scans the code, which points them to a static, serverless web interface with the WebSocket URI embedded as a parameter.

## 4. Nodes: Static Web App

Nodes are fundamentally dumb terminals. They require no backend servers and no complicated WebRTC negotiation. 
- **Hosting**: A simple static site (e.g., GitHub Pages).
- **Connection**: Connects directly to `ws://<HOST_LOCAL_IP>:8080`.
- **Decoding**: Uses the WebCodecs API or standard `AudioContext` pipelines to decode incoming Opus chunks.

## 5. Master Time Authority & Synchronization

### 5.1 NTP-Style Clock Sync over WebSocket
The Host acts as the Master Time Authority. Clock synchronization happens directly over the WebSocket connection using standard NTP-style round-trip time (RTT) calculations. 
- The Node sends a ping `t0`.
- The Host replies with its receive time `t1` and transmit time `t2`.
- The Node receives at `t3`, calculating the RTT and the precise offset between the Node's local clock and the Host's clock.

### 5.2 Jitter Buffer & Precise Scheduling
To achieve sub-millisecond phase alignment and counteract network jitter, a global artificial delay is introduced:
$$ T_{target\_global} = \text{captureTime} + 500\text{ms} $$

Both the Host (playing its own audio locally) and all Nodes buffer incoming chunks. The Web Nodes map this global target time to their local `AudioContext.currentTime`:

```javascript
// Calculate when the chunk should play on the local timeline
const timeUntilPlayMs = T_target_global - (localClock + clockOffset);
const localAudioContextTime = audioCtx.currentTime + (timeUntilPlayMs / 1000);

// Schedule precise playback
source.start(localAudioContextTime);
```

By scheduling the audio exactingly at `captureTime + 500ms`, all devices across the local network output sound simultaneously, achieving true multi-device spatial cohesion.
