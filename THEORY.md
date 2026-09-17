# Healing Nodes: Dynamic Distributed Spatial Audio Engine

## Core Concept
A multi-device environment that bridges algorithmic generation, spatial math, and biophysical resonance to create a "Healing Environment." The environment uses distributed local devices (Smart TV, PC, Phone) as nodes in an acoustic mesh network.

## The Triad of Mathematical Healing

### 1. Quadtree Mathematics (The Spatial Architecture)
Instead of static rooms, space is dynamically divided based on the number of nodes (N). 
- **1 Node:** Full spectrum generation (33Hz + Pink Noise + Visuals).
- **2 Nodes:** Spatial bisection ($\pi$). Left and right division of the spatial fields.
- **3 Nodes:** The Triangle ($\frac{2\pi}{3}$ or 120°). Sub-frequency grounding, spatial mid-range, and near-field somatosensory pulsing.

### 2. The Universal Connector ($\pi$ and Spherical Radiation)
- **Geometry:** Converts the Cartesian quadtree grid into organic, breathing reality using the inverse-square law ($A = 4\pi r^2$).
- **Circadian Rhythms:** Light and sound shift based on $2\pi$ sine waves (Angular Frequency, $\omega = 2\pi f$), syncing the room's phase with human biorhythms.
- **Phase Offset Routing:** Nodes are given phase shifts ($\theta_i = \frac{2\pi \cdot i}{N}$) to prevent destructive acoustic interference, creating ripples of waves that perfectly intersect at the center.

### 3. Biological Resonance (33 Hz & $1/f$ Pink Noise)
- **33 Hz (Low Gamma Binding Frequency):** Acts as the resonant root harmonic of human architectural space ($\lambda \approx 10.4\text{ m}$). It is the threshold where auditory perception meets somatosensory vibration (vagus nerve stimulation).
- **$1/f$ Pink Noise:** The spectral density of natural occurrences. Mimics wind, water, and organic baseline, promoting parasympathetic regulation (Alpha/Theta brainwaves).
- **The Inverse Equation:** Active biofeedback loops. If biometric data (like heart rate) indicates stress, the environment mathematically inverts the ambient state (e.g., lowering visual intensity, dipping spatial frequency, phase-canceling high frequencies) to guide the nervous system to homeostasis.

## Implementation Architecture
The system relies on a central Node.js WebSocket server to conduct the mathematical rendering across connected devices. 

1. **The Server (The Orchestrator):**
   - Emits absolute sync-times (UNIX timestamps).
   - Recalculates $\frac{2\pi}{N}$ geometry upon every node connection/disconnection.
   - Distributes JSON metadata containing the phase, harmonic octave, and spatial coordinates.

2. **The Client Nodes:**
   - Instead of streaming audio, they synthesize it locally using the Web Audio API.
   - Generate exact 33Hz Isochronic tones and $1/f$ filtering.
   - Use `PannerNode` for spherical, $\pi$-based spatial mapping.

*This document serves as the theoretical anchor for the Healing Nodes implementation.*
