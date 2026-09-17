# Healing Nodes: Platform Architecture & Implementation Blueprint

## 1. Browser Capabilities & Limitations (Web Audio API)
- **Audio Rendering**: Client-side rendering using Tone.js over Web Audio API. Requires an initial user interaction (e.g., a "Connect" or "Start" button) to unlock the audio context due to browser Autoplay policies.
- **Background Throttling**: Mobile browsers aggressively throttle JavaScript timers in background tabs, which can drift audio scheduling.
  - *Solution*: Offload timing-critical tasks to Web Workers. Utilize the `WakeLock API` (`navigator.wakeLock.request('screen')`) to keep the screen active and prevent the device from entering deep sleep while operating as an active spatial node.

## 2. Connectivity & Synchronization
- **Transport Layer**: WebSockets for low-latency, bidirectional real-time communication between the Node.js central server and client nodes.
- **Latency & Sync**: Implement an NTP-like ping/pong mechanism to measure round-trip time and estimate clock offset, allowing synchronized start times for audio events across distributed devices.
- **Jitter & Smoothing**: Apply jitter buffering and parameter interpolation (e.g., ramping Tone.js parameters) for incoming state events to ensure smooth audio transitions without clicking or popping.
- **Resilience**: Built-in auto-reconnect logic on the client side with exponential backoff.
- **Health Checks**: Regular heartbeat payloads to maintain active connections and allow the server to quickly prune disconnected/stale nodes from the spatial grid.

## 3. Sound Control & Device Management (Admin Dashboard)
- **Separation of Concerns**: The Admin Dashboard is hosted on a restricted route or separate port (System Access IP), potentially requiring authentication, entirely distinct from the lightweight Client Node view.
- **Global Control**: The Admin interface can broadcast global state overrides, such as master volume, target frequencies (e.g., 33 Hz), and noise profiles (1/f Pink Noise).
- **Spatial Grid Management**: The Admin dictates the virtual acoustic space using a quadtree or pi-based spatial distribution model. Connected devices can be visually mapped on the dashboard, and the admin can manually reassign their spatial coordinates or let the system auto-assign them based on connection order.

## 4. Automation
- **Autonomous Reactions**: The Node.js server exposes API endpoints to ingest external triggers, such as bio-feedback data (e.g., heart rate monitors or wearables). State rules can dynamically adjust frequencies or tempos based on this physiological input.
- **Circadian Automation**: Implement a time-based scheduling system (e.g., `node-cron`) to automatically transition the environment's soundscape based on the time of day, aligning with circadian rhythms.

## 5. Data Flow / State Management
- **State Model**: A Redux-like unidirectional global state is maintained on the central Server.
- **Broadcast Strategy**: Clients do not mutate state directly; they send intents to the server. The server resolves these and broadcasts state updates (or diffs) to all clients via WebSockets.
- **JSON Payload Example**:
  ```json
  {
    "type": "STATE_UPDATE",
    "timestamp": 1694947931000,
    "payload": {
      "globalVolume": 0.8,
      "frequencies": {
        "base": 33.0,
        "noiseType": "pink"
      },
      "spatialContext": {
        "center": [0, 0],
        "radius": 10
      }
    }
  }
  ```
