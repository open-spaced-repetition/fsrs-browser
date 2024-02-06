use burn::backend::NdArray;
use fsrs::{FSRSItem, FSRSReview, DEFAULT_WEIGHTS, FSRS};
use log::info;
use log::Level;
use wasm_bindgen::prelude::*;
use web_sys::console;
extern crate console_error_panic_hook;

#[wasm_bindgen(js_name = Fsrs)]
pub struct FSRSwasm {
    model: FSRS<NdArray>,
}

impl Default for FSRSwasm {
    fn default() -> Self {
        Self::new()
    }
}

/// Fills given number slice with fibonacci numbers
#[wasm_bindgen(js_name = fillWithFibonacci)]
pub fn fill_with_fibonacci(buffer: &mut [u32]) {
    if buffer.is_empty() {
        return;
    }
    buffer[0] = 0;

    if buffer.len() == 1 {
        return;
    }
    buffer[1] = 1;

    for i in 2..buffer.len() {
        buffer[i] = buffer[i - 1] + buffer[i - 2];
    }
}
// endregion: Number slices

#[wasm_bindgen(js_class = Fsrs)]
impl FSRSwasm {
    #[cfg_attr(target_family = "wasm", wasm_bindgen(constructor))]
    pub fn new() -> Self {
        console_error_panic_hook::set_once();
        console_log::init_with_level(Level::Debug);
        Self {
            model: FSRS::new(Some(&DEFAULT_WEIGHTS)).unwrap(),
        }
    }

    #[wasm_bindgen(js_name = computeWeights)]
    pub fn compute_weights(
        &self,
        ratings: &[u32],
        delta_ts: &[u32],
        lengths: &[usize],
    ) -> Result<Vec<f32>, String> {
        let mut i = 0 as usize;
        let items: Vec<_> = lengths
            // .windows(2)
            .into_iter()
            .map(|length| {
                // let a = length[0];
                let a = i;
                let b = *length + a;
                // console::log_3(&"a to b ".into(), &a.into(), &b.into());
                let reviews: Vec<FSRSReview> = (ratings[a..b])
                    .iter()
                    .zip(&delta_ts[a..b])
                    .map(|(rating, delta_t)| FSRSReview {
                        rating: *rating,
                        delta_t: *delta_t,
                    })
                    .collect();
                i = i + *length;
                console::log_2(&"reviews len is ".into(), &reviews.len().into());
                FSRSItem { reviews }
            })
            .collect();
        // println!("qq", items);
        // console::log_2(&"Logging arbitrary values looks like".into(), items);
        // console::log(&"Logging arbitrary values looks like".into() );
        // use web_sys::console;

        console::log_2(&"Items len is".into(), &items.len().into());

        // log::info!("what {:?}", items);
        self.model
            .compute_weights(items, None)
            .map_err(|e| match e {
                FSRSError::Interrupted => String::from("Interrupted"),
                FSRSError::NotEnoughData => String::from("NotEnoughData"),
                FSRSError::InvalidWeights => String::from("InvalidWeights"),
            })
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

#[wasm_bindgen]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}
