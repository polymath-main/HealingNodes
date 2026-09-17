# HealingNodes

HealingNodes is a distributed spatial audio engine built on pure mathematics. It turns connected devices (Smart TVs, PCs, and Phones) into a dynamic acoustic mesh network designed to regulate the human autonomic nervous system through biophysical resonance.

## The Triad of Mathematical Healing

1. **Liquid Fluid Daydream Engine (Visuals)**
   A pure HTML5 Canvas WebGL-inspired engine. It generates overlapping, glowing liquid waveforms using multi-layered low-frequency sine algorithms that breathe and pulsate directly in sync with the audio hardware clock. The visuals map dynamically to the precise spatial $\pi$ angle assigned to each device.

2. **Pure $1/f$ Pink Noise (Voss-McCartney Algorithm)**
   Instead of using pre-recorded MP3s or wrapper libraries, HealingNodes generates perfect acoustic entropy natively on the browser's C++ audio thread using the Voss-McCartney cascading filter algorithm. A 0.1Hz algorithmic Low Frequency Oscillator (LFO) causes the pink noise to "breathe" exactly once every 10 seconds.

3. **33 Hz Binding Frequency & Spatial Triangulation**
   The base of the environment is anchored by a 33 Hz sine wave (the frequency associated with low-gamma cognitive binding and vagus nerve stimulation). When multiple nodes connect, the central Node.js Orchestrator calculates the spatial division ($\frac{2\pi}{N}$) and assigns each device a perfect geometric phase and harmonic frequency multiplier, surrounding the listener in a mathematically perfect chord.

## Architecture

*   **Server (The Orchestrator):** Node.js + Socket.io. Tracks active devices, calculates the room's mesh geometry in real-time, and broadcasts the NTP-style clock sync offset.
*   **Client (The Nodes):** Native Web Audio API (`AudioContext`) and HTML5 Canvas. Zero external audio frameworks. Receives the mathematical instructions and renders the physical audio/visual waves locally to prevent network jitter.
*   **System Access IP (Admin Dashboard):** A dedicated control panel allowing manual override of the base frequency and simulation of Bio-Feedback (e.g., HRV/stress spikes) which dynamically inverts the room's acoustic state.

## Installation & Usage

1. Clone the repository:
   ```bash
   git clone https://github.com/polymath-main/HealingNodes.git
   cd HealingNodes
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Boot the environment:
   ```bash
   node server.js
   ```

4. Connect your nodes:
   * **Root Node:** Open `http://localhost:3000` on your phone/PC and double-tap to enter the Fullscreen Daydream Engine.
   * **Conductor Dashboard:** Open `http://localhost:3000/admin.html` to control the environment.
   * **Spatial Expansion:** Open the local network IP (e.g., `http://192.168.x.x:3000`) on a Smart TV or second laptop to watch the spatial mesh mathematically divide in real-time.

---
*Built within the Polymath Ecosystem.*
