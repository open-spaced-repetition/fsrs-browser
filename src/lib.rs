use burn::backend::NdArrayBackend;
use fsrs::{FSRSItem, FSRSReview, Result, DEFAULT_WEIGHTS, FSRS};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = Fsrs)]
pub struct FSRSwasm {
    model: Result<FSRS<NdArrayBackend>>,
}

#[wasm_bindgen(js_class = Fsrs)]
impl FSRSwasm {
    #[cfg_attr(target_family = "wasm", wasm_bindgen(constructor))]
    pub fn new() -> Self {
        Self {
            model: FSRS::new(Some(&DEFAULT_WEIGHTS)),
        }
    }
    #[wasm_bindgen(js_name = memoryState)]
    pub fn memory_state(&self, ratings: Vec<u32>, delta_ts: Vec<u32>) -> Vec<f32> {
        let reviews: Vec<(u32, u32)> = ratings.into_iter().zip(delta_ts.into_iter()).collect();
        let item = FSRSItem {
            reviews: reviews
                .into_iter()
                .map(|(rating, delta_t)| FSRSReview { rating, delta_t })
                .collect(),
        };
        let state = self.model.as_ref().unwrap().memory_state(item);
        vec![state.stability, state.difficulty]
    }
    #[wasm_bindgen(js_name = nextInterval)]
    pub fn next_interval(
        &self,
        stability: Option<f32>,
        desired_retention: f32,
        rating: u32,
    ) -> u32 {
        self.model
            .as_ref()
            .unwrap()
            .next_interval(stability, desired_retention, rating)
    }
}
