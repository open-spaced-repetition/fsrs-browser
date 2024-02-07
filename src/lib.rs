use burn::backend::NdArray;
use fsrs::{anki_to_fsrs, to_revlog_entry, FSRSItem, FSRSReview, DEFAULT_WEIGHTS, FSRS};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = Fsrs)]
pub struct FSRSwasm {
    model: FSRS<NdArray>,
}

impl Default for FSRSwasm {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen(js_class = Fsrs)]
impl FSRSwasm {
    #[cfg_attr(target_family = "wasm", wasm_bindgen(constructor))]
    pub fn new() -> Self {
        Self {
            model: FSRS::new(Some(&DEFAULT_WEIGHTS)).unwrap(),
        }
    }

    #[wasm_bindgen(js_name = computeWeights)]
    #[allow(clippy::too_many_arguments)]
    pub fn compute_weights(
        &self,
        cids: &[i64],
        eases: &[u8],
        factors: &[u32],
        ids: &[i64],
        ivls: &[i32],
        last_ivls: &[i32],
        times: &[u32],
        types: &[u8],
        usns: &[i32],
    ) -> Vec<f32> {
        let revlog_entries = to_revlog_entry(
            cids, eases, factors, ids, ivls, last_ivls, times, types, usns,
        );
        let items = anki_to_fsrs(revlog_entries);
        self.model.compute_weights(items, false, None).unwrap()
    }

    #[wasm_bindgen(js_name = memoryState)]
    pub fn memory_state(&self, ratings: &[u32], delta_ts: &[u32]) -> Vec<f32> {
        let item = FSRSItem {
            reviews: ratings
                .iter()
                .zip(delta_ts)
                .map(|(rating, delta_t)| FSRSReview {
                    rating: *rating,
                    delta_t: *delta_t,
                })
                .collect(),
        };
        let state = self.model.memory_state(item, None).unwrap();
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
            .next_interval(stability, desired_retention, rating)
    }
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    console_log::init().expect("Error initializing logger");
}
