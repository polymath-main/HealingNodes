# HealingNodes - Phase 7 Media Streaming

HealingNodes is a distributed spatial audio engine designed to broadcast arbitrary media (movies, Spotify, desktop audio) from a central Host computer to multiple secondary Nodes (phones, TVs, laptops) over your local Wi-Fi.

Unlike standard screen-sharing or Bluetooth, HealingNodes utilizes a highly advanced **Jitter Buffer** and **Sub-Millisecond Clock Synchronization (NTP)** to guarantee that every speaker in your room fires at the exact same microsecond, producing a perfect, echo-free acoustic mesh.

## Architecture

*   **The Host (Desktop App):** A native OS executable that captures your system audio (via Virtual Audio Cable), slices it into Opus chunks using the modern WebCodecs API, and blasts it over a local WebSocket server (`ws://192.168.x.x:8080`).
*   **The Nodes (Static Web App):** Phones and TVs simply scan a QR code to open the static Web App. The app connects to the Host's WebSocket, decodes the Opus chunks, and schedules playback precisely at `Capture Time + 500ms` to eliminate all network jitter.

## How to Build the Executable (Cross-Platform)

The Host application can be compiled into a standalone, double-clickable binary for **Windows (`.exe`)**, **macOS**, and **Linux** using the Vercel `pkg` compiler.

### Option 1: Automated Build (GitHub Actions)
1. Fork or push this repository to GitHub.
2. Navigate to the **Actions** tab in your repository.
3. Select the **Build Host Binaries** workflow and click **Run workflow**.
4. Once completed, download the `HealingNodes-Executables.zip` artifact containing the `.exe`, macOS, and Linux binaries.

### Option 2: Local Manual Build
To build the executable manually on your own machine:

1. **Install Node.js** (v20+ recommended).
2. **Install `pkg` globally**:
   ```bash
   npm install -g pkg
   ```
3. **Navigate to the Host directory & install dependencies**:
   ```bash
   cd host
   npm install
   ```
4. **Compile for your specific platform**:
   - **For Windows**:
     ```bash
     pkg src/index.js --targets node20-win-x64 --output dist/HealingNodes-Host.exe
     ```
   - **For macOS**:
     ```bash
     pkg src/index.js --targets node20-macos-x64 --output dist/HealingNodes-Host-macOS
     ```
   - **For Linux**:
     ```bash
     pkg src/index.js --targets node20-linux-x64 --output dist/HealingNodes-Host-Linux
     ```

## Installation & Usage

### 1. Start the Host (Laptop/PC)
Double-click the generated `HealingNodes-Host.exe` (Windows) or execute the binary on Mac/Linux. 
*Ensure your OS sound output is routed to a Virtual Audio Cable if you wish to mute the physical laptop speakers.*

### 2. Connect the Nodes (Phones/TVs)
The Host will print a local WebSocket IP address (e.g., `192.168.1.100:8080`) and a QR code to the terminal.
* Open the `client/index.html` (or your GitHub Pages deployment) on your phone.
* Enter the IP address to connect.
* The phone will instantly begin playing the host's audio in perfect phase-aligned sync!
