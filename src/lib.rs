use burn::backend::NdArrayBackend;
use fsrs::FSRS;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = Fsrs)]
pub struct FSRSwasm(FSRS<NdArrayBackend>);

#[wasm_bindgen(js_class = Fsrs)]
impl FSRSwasm {
    #[wasm_bindgen(js_name = nextInterval)]
    pub fn next_interval(
        &self,
        stability: Option<f32>,
        desired_retention: f32,
        rating: u32,
    ) -> u32 {
        self.0.next_interval(stability, desired_retention, rating)
    }
}
