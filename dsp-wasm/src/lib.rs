use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct BiquadFilter {
    a1: f32, a2: f32, b0: f32, b1: f32, b2: f32,
    z1: f32, z2: f32,
}

#[wasm_bindgen]
impl BiquadFilter {
    #[wasm_bindgen(constructor)]
    pub fn new() -> BiquadFilter {
        BiquadFilter {
            a1: 0.0, a2: 0.0, b0: 1.0, b1: 0.0, b2: 0.0,
            z1: 0.0, z2: 0.0,
        }
    }

    pub fn set_highpass(&mut self, freq: f32, sample_rate: f32) {
        let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
        let alpha = w0.sin() / (2.0 * 0.70710678); // Butterworth Q
        let cos_w0 = w0.cos();
        let a0 = 1.0 + alpha;

        self.b0 = ((1.0 + cos_w0) / 2.0) / a0;
        self.b1 = -(1.0 + cos_w0) / a0;
        self.b2 = ((1.0 + cos_w0) / 2.0) / a0;
        self.a1 = (-2.0 * cos_w0) / a0;
        self.a2 = (1.0 - alpha) / a0;
    }

    pub fn process(&mut self, input: f32) -> f32 {
        let output = self.b0 * input + self.b1 * self.z1 + self.b2 * self.z2
                     - self.a1 * self.z1 - self.a2 * self.z2;
        self.z2 = self.z1;
        self.z1 = input; // Note: simplified direct form 1 for proof of concept
        output
    }
}

// 4th Order Linkwitz-Riley is two cascaded Butterworth filters
#[wasm_bindgen]
pub struct LinkwitzRiley4 {
    stage1: BiquadFilter,
    stage2: BiquadFilter,
}

#[wasm_bindgen]
impl LinkwitzRiley4 {
    #[wasm_bindgen(constructor)]
    pub fn new(freq: f32, sample_rate: f32) -> LinkwitzRiley4 {
        let mut filter = LinkwitzRiley4 {
            stage1: BiquadFilter::new(),
            stage2: BiquadFilter::new(),
        };
        filter.stage1.set_highpass(freq, sample_rate);
        filter.stage2.set_highpass(freq, sample_rate);
        filter
    }

    pub fn process(&mut self, input: f32) -> f32 {
        self.stage2.process(self.stage1.process(input))
    }
}
