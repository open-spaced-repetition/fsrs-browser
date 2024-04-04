use burn::backend::NdArray;
use fsrs::{
    anki_to_fsrs, to_revlog_entry, CombinedProgressState, FSRSItem, FSRSReview, MemoryState,
    NextStates, Progress, DEFAULT_PARAMETERS, FSRS,
};
use log::{info, warn};
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
    pub fn new(parameters: Option<Vec<f32>>) -> Self {
        let model = match parameters {
            Some(parameters) => FSRS::new(Some(&parameters)),
            None => FSRS::new(Some(&DEFAULT_PARAMETERS)),
        }
        .unwrap();
        Self { model }
    }

    #[wasm_bindgen(js_name = computeParametersAnki)]
    pub fn compute_parameters_anki(
        &mut self,
        cids: &[i64],
        eases: &[u8],
        ids: &[i64],
        types: &[u8],
        progress: Option<Progress>,
    ) -> Vec<f32> {
        let revlog_entries = to_revlog_entry(cids, eases, ids, types);
        let items = anki_to_fsrs(revlog_entries);
        self.train_and_set_parameters(items, progress)
    }

    #[wasm_bindgen(js_name = computeParameters)]
    pub fn compute_parameters(
        mut self,
        ratings: &[u32],
        delta_ts: &[u32],
        lengths: &[u32],
        progress: Option<Progress>,
    ) -> Vec<f32> {
        let items = Self::to_fsrs_items(ratings, delta_ts, lengths);
        self.train_and_set_parameters(items, progress)
    }

    fn train_and_set_parameters(
        &mut self,
        items: Vec<FSRSItem>,
        progress: Option<Progress>,
    ) -> Vec<f32> {
        #[cfg(debug_assertions)]
        warn!("You're training with a debug build... this is going to take a *long* time.");
        let parameters = self
            .model
            .compute_parameters(items, Some(CombinedProgressState::new_shared(progress)))
            .unwrap();
        self.model = FSRS::new(Some(&parameters)).unwrap();
        parameters
    }

    #[wasm_bindgen(js_name = memoryState)]
    /// Returns an array of 2 elements: `[stability, difficulty]`
    pub fn memory_state(&self, ratings: &[u32], delta_ts: &[u32]) -> Vec<f32> {
        assert!(
            ratings.len() == delta_ts.len(),
            "`ratings` has {} elements and `delta_ts` has {} elements, but they should be equal in size.",
            ratings.len(),
            delta_ts.len(),
        );
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
        self._memory_state(item)
    }

    fn _memory_state(&self, item: FSRSItem) -> Vec<f32> {
        let state = self.model.memory_state(item, None).unwrap();
        vec![state.stability, state.difficulty]
    }

    #[wasm_bindgen(js_name = memoryStateAnki)]
    /// Returns an array of 2 elements: `[stability, difficulty]`
    pub fn memory_state_anki(
        &self,
        cids: &mut [i64],
        eases: &[u8],
        ids: &[i64],
        types: &[u8],
    ) -> Option<Vec<f32>> {
        // https://www.reddit.com/r/rust/comments/b4cxrj/how_to_count_number_of_unique_items_in_an_array/ej8kp2y/
        cids.sort();
        let len = if cids.is_empty() {
            0
        } else {
            1 + cids.windows(2).filter(|win| win[0] != win[1]).count()
        };
        assert_eq!(len, 1, "Expected 1 card, but was given {}", len);

        let revlog_entries = to_revlog_entry(cids, eases, ids, types);
        anki_to_fsrs(revlog_entries)
            .pop()
            .map(|item| self._memory_state(item))
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

    #[wasm_bindgen(js_name = nextStates)]
    pub fn next_states(
        &self,
        stability: Option<f32>,
        difficulty: Option<f32>,
        desired_retention: f32,
        days_elapsed: u32,
    ) -> NextStates {
        let current_memory_state = stability.and_then(|stability| {
            difficulty.map(|difficulty| MemoryState {
                stability,
                difficulty,
            })
        });
        self.model
            .next_states(current_memory_state, desired_retention, days_elapsed)
            .unwrap()
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
