// Probe script for DSP Math: Mid/Side Matrix, Crossover, Limiter, Smoothstep
function testMidSide(L, R, theta) {
    const mid = (L + R) * 0.5;
    const side = (L - R) * 0.5;
    const mixRatio = Math.abs(Math.cos(theta));
    const output = mid * mixRatio + side * (1.0 - mixRatio);
    return { mid, side, mixRatio, output };
}

console.log("=== 1. MID/SIDE PHASE EXTRACTION MATRIX TESTS ===");
// Case A: Center dialogue (L=1, R=1)
console.log("Center Mono (L=1, R=1):");
[0, Math.PI/4, Math.PI/2, Math.PI, 3*Math.PI/2].forEach(angle => {
    const deg = Math.round(angle * 180 / Math.PI);
    const res = testMidSide(1.0, 1.0, angle);
    console.log(`  Angle ${deg} deg: Mid=${res.mid.toFixed(2)}, Side=${res.side.toFixed(2)}, Ratio=${res.mixRatio.toFixed(2)}, Out=${res.output.toFixed(2)}`);
});

// Case B: Pure Side Ambience (L=1, R=-1)
console.log("\nPure Side (L=1, R=-1):");
[0, Math.PI/4, Math.PI/2, Math.PI, 3*Math.PI/2].forEach(angle => {
    const deg = Math.round(angle * 180 / Math.PI);
    const res = testMidSide(1.0, -1.0, angle);
    console.log(`  Angle ${deg} deg: Mid=${res.mid.toFixed(2)}, Side=${res.side.toFixed(2)}, Ratio=${res.mixRatio.toFixed(2)}, Out=${res.output.toFixed(2)}`);
});

// Case C: Hard Right (L=0, R=1)
console.log("\nHard Right (L=0, R=1):");
[0, Math.PI/2, 3*Math.PI/2].forEach(angle => {
    const deg = Math.round(angle * 180 / Math.PI);
    const res = testMidSide(0.0, 1.0, angle);
    console.log(`  Angle ${deg} deg: Mid=${res.mid.toFixed(2)}, Side=${res.side.toFixed(2)}, Ratio=${res.mixRatio.toFixed(2)}, Out=${res.output.toFixed(2)}`);
});

console.log("\n=== 2. SMOOTHSTEP & LERP VERIFICATION ===");
function smoothstep(t) {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
}
function lerp(a, b, t) {
    return (1 - t) * a + t * b;
}

[0, 0.25, 0.5, 0.75, 1.0, 1.5, -0.2].forEach(t => {
    const s = smoothstep(t);
    const val = lerp(33, 60, s);
    console.log(`  t=${t}: smoothstep=${s.toFixed(4)}, lerped f_base=${val.toFixed(2)}`);
});

console.log("\n=== 3. NTP CLOCK SYNC MEDIAN FILTER ===");
function computeNtpOffset(samples) {
    // Each sample is: serverTime - clientTime - latency
    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return { sorted, median };
}

// 10 samples with a +200ms latency spike outlier
const noisySamples = [15, 16, 14, 15, 210, 15, 17, 14, 16, 15];
console.log("Noisy NTP samples:", noisySamples);
const ntpRes = computeNtpOffset(noisySamples);
console.log("Sorted samples:", ntpRes.sorted);
console.log("Median offset (jitter-rejected):", ntpRes.median, "ms (Expected: ~15ms)");
