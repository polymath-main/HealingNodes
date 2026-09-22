# HealingNodes Project Instructions

HealingNodes is a distributed spatial audio engine designed to turn multiple devices into a dynamic acoustic mesh network. It leverages the Web Audio API for high-precision DSP and WebGL for reactive visual entrainment.

## Project Overview
- **Architecture**: A Node.js orchestrator (Server) managing a distributed mesh of clients (Nodes).
- **Core Technologies**:
  - **Server**: Node.js, Express, Socket.io (Planned).
  - **Client**: Web Audio API (Native DSP), WebGL2 (Fluid/Waveform visuals).
- **Mathematical Basis**: Uses specific frequencies (e.g., 33Hz Low Gamma) and algorithmic noise (Voss-McCartney Pink Noise) for biophysical resonance.

## Implementation Status (CRITICAL)
- **Current State**: The project is currently in a "Stateless/Skeletal" phase. 
- **Documentation vs. Reality**: Files like `ARCHITECTURE_BLUEPRINT.md` and `PROJECT.md` describe advanced features (NTP sync, M/S Matrix, Crossovers) that are **not yet implemented** in the root `server.js` or `public/js/app.js`.
- **Swarm Activity**: Development is actively occurring in `.agents/teamwork_preview_*` directories. Consult these for the latest DSP and Network implementation logic before modifying root files.

## Building and Running
- **Installation**: `npm install`
- **Starting the Server**: `npm start` or `node server.js`
- **Accessing the App**:
  - **Client Node**: `http://localhost:3000`
  - **Admin Dashboard**: `http://localhost:3000/admin.html` (Planned/Placeholder)

## Development Conventions
- **DSP Integrity**: Avoid external audio libraries. Use native `AudioContext` and `AudioWorklet`.
- **Synchronization**: All timing changes must be scheduled using `audioCtx.currentTime` and NTP-corrected server offsets to ensure phase alignment across nodes.
- **Visuals**: WebGL shaders should be modulated by real-time frequency data from the `AnalyserNode`.
- **State Management**: The server should remain a mathematical orchestrator, emitting state vectors (V) rather than streaming audio data.

## Key Files
- `server.js`: Main entry point for the Node.js orchestrator.
- `public/js/app.js`: Core client-side logic, DSP graph, and visual rendering.
- `ARCHITECTURE_BLUEPRINT.md`: The definitive source for the mathematical and signal-routing specifications.
- `PROJECT.md`: Feature inventory and milestone tracking.
- `THEORY.md`: Mathematical and biophysical rationale for the engine.
