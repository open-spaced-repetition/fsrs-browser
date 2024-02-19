use burn::backend::NdArray;
use fsrs::{anki_to_fsrs, to_revlog_entry, FSRSItem, FSRSReview, FSRS};
use log::info;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = Fsrs)]
pub struct FSRSwasm {
    model: FSRS<NdArray>,
}

impl Default for FSRSwasm {
    fn default() -> Self {
        Self::new(None)
    }
}

#[wasm_bindgen(js_class = Fsrs)]
impl FSRSwasm {
    #[cfg_attr(target_family = "wasm", wasm_bindgen(constructor))]
    pub fn new(weights: Option<Vec<f32>>) -> Self {
        Self {
            model: FSRS::new(weights.as_deref()).unwrap(),
        }
    }

    #[wasm_bindgen(js_name = computeWeightsAnki)]
    #[allow(clippy::too_many_arguments)]
    pub fn compute_weights_anki(
        &mut self,
        cids: &[i64],
        eases: &[u8],
        ids: &[i64],
        types: &[u8],
    ) -> Vec<f32> {
        let revlog_entries = to_revlog_entry(cids, eases, ids, types);
        let items = anki_to_fsrs(revlog_entries);
        self.train_and_set_weights(items)
    }

    #[wasm_bindgen(js_name = computeWeights)]
    pub fn compute_weights(
        mut self,
        ratings: &[u32],
        delta_ts: &[u32],
        lengths: &[u32],
    ) -> Vec<f32> {
        let items = Self::to_fsrs_items(ratings, delta_ts, lengths);
        self.train_and_set_weights(items)
    }

    fn train_and_set_weights(&mut self, items: Vec<FSRSItem>) -> Vec<f32> {
        let weights = self.model.compute_weights(items, false, None).unwrap();
        self.model = FSRS::new(Some(&weights)).unwrap();
        weights
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

    // Deserialization is done here.
    // An example serialization is done at `./sandbox/src/testSerialization.ts`.
    fn to_fsrs_items(ratings: &[u32], delta_ts: &[u32], lengths: &[u32]) -> Vec<FSRSItem> {
        assert!(
            ratings.len() == delta_ts.len(),
            "`ratings` has {} elements and `delta_ts` has {} elements, but they should be equal.",
            ratings.len(),
            delta_ts.len(),
        );
        let mut start = 0;
        lengths
            .iter()
            .map(|length| {
                let end = start + *length as usize;
                let ratings = &ratings[start..end];
                let delta_ts = &delta_ts[start..end];
                start = end;
                FSRSItem {
                    reviews: ratings
                        .iter()
                        .zip(delta_ts)
                        .map(|(rating, delta_t)| FSRSReview {
                            rating: *rating,
                            delta_t: *delta_t,
                        })
                        .collect(),
                }
            })
            .collect::<Vec<_>>()
    }

    #[wasm_bindgen(js_name = testSerialization)]
    #[cfg(debug_assertions)] // only include this "test" in debug builds
    pub fn test_serialization(ratings: &[u32], delta_ts: &[u32], lengths: &[u32]) {
        let actual = Self::to_fsrs_items(ratings, delta_ts, lengths);
        let expected = vec![
            FSRSItem {
                reviews: vec![
                    FSRSReview {
                        rating: 4,
                        delta_t: 0,
                    },
                    FSRSReview {
                        rating: 3,
                        delta_t: 5,
                    },
                ],
            },
            FSRSItem {
                reviews: vec![
                    FSRSReview {
                        rating: 4,
                        delta_t: 0,
                    },
                    FSRSReview {
                        rating: 3,
                        delta_t: 5,
                    },
                    FSRSReview {
                        rating: 3,
                        delta_t: 11,
                    },
                ],
            },
            FSRSItem {
                reviews: vec![
                    FSRSReview {
                        rating: 4,
                        delta_t: 0,
                    },
                    FSRSReview {
                        rating: 3,
                        delta_t: 2,
                    },
                ],
            },
            FSRSItem {
                reviews: vec![
                    FSRSReview {
                        rating: 4,
                        delta_t: 0,
                    },
                    FSRSReview {
                        rating: 3,
                        delta_t: 2,
                    },
                    FSRSReview {
                        rating: 3,
                        delta_t: 6,
                    },
                ],
            },
            FSRSItem {
                reviews: vec![
                    FSRSReview {
                        rating: 4,
                        delta_t: 0,
                    },
                    FSRSReview {
                        rating: 3,
                        delta_t: 2,
                    },
                    FSRSReview {
                        rating: 3,
                        delta_t: 6,
                    },
                    FSRSReview {
                        rating: 3,
                        delta_t: 16,
                    },
                ],
            },
            FSRSItem {
                reviews: vec![
                    FSRSReview {
                        rating: 4,
                        delta_t: 0,
                    },
                    FSRSReview {
                        rating: 3,
                        delta_t: 2,
                    },
                    FSRSReview {
                        rating: 3,
                        delta_t: 6,
                    },
                    FSRSReview {
                        rating: 3,
                        delta_t: 16,
                    },
                    FSRSReview {
                        rating: 3,
                        delta_t: 39,
                    },
                ],
            },
            FSRSItem {
                reviews: vec![
                    FSRSReview {
                        rating: 1,
                        delta_t: 0,
                    },
                    FSRSReview {
                        rating: 1,
                        delta_t: 1,
                    },
                ],
            },
            FSRSItem {
                reviews: vec![
                    FSRSReview {
                        rating: 1,
                        delta_t: 0,
                    },
                    FSRSReview {
                        rating: 1,
                        delta_t: 1,
                    },
                    FSRSReview {
                        rating: 3,
                        delta_t: 1,
                    },
                ],
            },
        ];
        assert_eq!(expected, actual);
        info!("Test passed!");
    }
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    console_log::init().expect("Error initializing logger");
}
