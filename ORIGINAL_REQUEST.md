# Original User Request

## Initial Request — 2026-09-17T20:59:12Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Deploy the full team

Perform a comprehensive, rigorous structural, DSP, and architectural audit of the entire HealingNodes Dual-Core project codebase to ensure mathematical accuracy, system stability, and flawless execution. The team must actively implement and commit fixes for any bugs discovered.

Working directory: /data/data/com.termux/files/home/Projects/HealingNodes
Integrity mode: development

## Requirements

### R1. Audit and Fix the Web Audio DSP Architecture
Review the `public/app.js` Dual-Core logic. Specifically audit the mathematical correctness of the Mid/Side phase extraction matrix, the Butterworth hardware crossovers, and the brickwall limiters. Implement fixes for any acoustic physics or routing flaws found.

### R2. Audit and Fix the Network Synchronization Orchestration
Review `server.js` and `src/core/MediaEngine.js`. Ensure the NTP socket.io media buffering and trajectory interpolation logic is completely robust against network jitter, late-joining clients, and state-mutation bugs (like the previous `lerp` bug). Implement and commit fixes for any flaws found.

## Acceptance Criteria

### Verification: Automated QA
- [ ] The Universal QA Analyzer (`python ~/.gemini/config/skills/qa-analyzer/scripts/analyzer.py .`) runs and passes with 0 structural or syntax errors after all fixes are committed.

### Verification: Agent-as-Judge
- [ ] An independent reviewer agent audits the committed DSP math and confirms the changes strictly adhere to physical Web Audio API constraints (no illegal routing, correct phase-inversion mathematics).
