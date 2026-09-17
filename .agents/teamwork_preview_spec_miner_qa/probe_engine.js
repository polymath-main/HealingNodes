// Probe script for ModeEngine and MediaEngine
const ModeEngine = require('../../src/core/ModeEngine');
const MediaEngine = require('../../src/core/MediaEngine');

console.log("=== PROBING MODE ENGINE ===");
let emittedEvents = [];
const mockIo = {
    emit: (event, data) => emittedEvents.push({ type: 'broadcast', event, data }),
    to: (id) => ({
        emit: (event, data) => emittedEvents.push({ type: 'targeted', to: id, event, data })
    })
};

let nodes = ['node-1', 'node-2', 'node-3'];
let activeCore = 'mode';
const getNodes = () => nodes;
const getActiveCore = () => activeCore;

const modeEngine = new ModeEngine(mockIo, getNodes, getActiveCore);

console.log("Initial state:", modeEngine.currentState);
modeEngine.broadcastState();
console.log("Broadcast events count:", emittedEvents.length);
console.log("Broadcast admin event:", emittedEvents.find(e => e.event === 'admin_state_update'));
console.log("Targeted audio events:", emittedEvents.filter(e => e.event === 'audio_state_update'));

// Test trajectory
emittedEvents = [];
modeEngine.startTrajectory({ f_base: 60, harmonic_ratio: 2.0 }, 2000);
console.log("Start state snapshot:", modeEngine.startState);
console.log("Target state:", modeEngine.targetState);

// Simulate tick after 1000ms
modeEngine.startTime = Date.now() - 1000;
modeEngine.tick();
console.log("State at 50% time:", modeEngine.currentState);

// Simulate tick after 2000ms
modeEngine.startTime = Date.now() - 2000;
modeEngine.tick();
console.log("State at 100% time:", modeEngine.currentState);

// Test stop
modeEngine.stopTrajectory();
console.log("Target state after stop:", modeEngine.targetState);
console.log("Duration after stop:", modeEngine.duration);

clearInterval(modeEngine.intervalId);

console.log("\n=== PROBING MEDIA ENGINE ===");
emittedEvents = [];
const mediaEngine = new MediaEngine(mockIo, getNodes, () => 'media');
mediaEngine.setMediaUrl('/media/theater_track.mp3');
console.log("Media state after setMediaUrl:", mediaEngine.currentMediaState);
console.log("Set media events:", emittedEvents);

emittedEvents = [];
mediaEngine.play();
console.log("Media state after play:", mediaEngine.currentMediaState);
console.log("Play events:", emittedEvents);

emittedEvents = [];
mediaEngine.pause();
console.log("Media state after pause:", mediaEngine.currentMediaState);
console.log("Pause events:", emittedEvents);
