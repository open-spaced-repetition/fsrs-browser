mod anki;

use std::sync::{
    atomic::{AtomicBool, AtomicU32, Ordering},
    Arc, Mutex,
};
use std::time::Duration;

use anki::{anki_to_fsrs, to_revlog_entry};
use fsrs::{
    check_and_fill_parameters as check_fsrs_parameters,
    compute_parameters as compute_fsrs_parameters, CombinedProgressState, ComputeParametersInput,
    FSRSItem, FSRSReview, MemoryState, TrainingConfig as FsrsTrainingConfig, DEFAULT_PARAMETERS,
    FSRS,
};
#[cfg(debug_assertions)]
use log::{info, warn};
use wasm_bindgen::prelude::*;
pub use wasm_bindgen_rayon::init_thread_pool;

#[wasm_bindgen]
#[derive(Debug, Clone, Default)]
pub struct TrainingConfig {
    config: FsrsTrainingConfig,
}

#[wasm_bindgen]
impl TrainingConfig {
    #[wasm_bindgen(constructor)]
    pub fn new() -> TrainingConfig {
        Self::default()
    }

    #[wasm_bindgen(js_name = withValues)]
    pub fn with_values(
        num_epochs: usize,
        batch_size: usize,
        seed: u64,
        learning_rate: f64,
        max_seq_len: usize,
        gamma: f64,
    ) -> TrainingConfig {
        let config = Self {
            config: FsrsTrainingConfig {
                num_epochs,
                batch_size,
                seed,
                learning_rate,
                max_seq_len,
                gamma,
            },
        };
        config.assert_valid();
        config
    }

    #[wasm_bindgen(getter, js_name = numEpochs)]
    pub fn num_epochs(&self) -> usize {
        self.config.num_epochs
    }

    #[wasm_bindgen(setter, js_name = numEpochs)]
    pub fn set_num_epochs(&mut self, value: usize) {
        self.config.num_epochs = value;
    }

    #[wasm_bindgen(getter, js_name = batchSize)]
    pub fn batch_size(&self) -> usize {
        self.config.batch_size
    }

    #[wasm_bindgen(setter, js_name = batchSize)]
    pub fn set_batch_size(&mut self, value: usize) {
        assert!(value > 0, "batchSize must be greater than 0");
        self.config.batch_size = value;
    }

    #[wasm_bindgen(getter)]
    pub fn seed(&self) -> u64 {
        self.config.seed
    }

    #[wasm_bindgen(setter)]
    pub fn set_seed(&mut self, value: u64) {
        self.config.seed = value;
    }

    #[wasm_bindgen(getter, js_name = learningRate)]
    pub fn learning_rate(&self) -> f64 {
        self.config.learning_rate
    }

    #[wasm_bindgen(setter, js_name = learningRate)]
    pub fn set_learning_rate(&mut self, value: f64) {
        assert!(value.is_finite(), "learningRate must be finite");
        self.config.learning_rate = value;
    }

    #[wasm_bindgen(getter, js_name = maxSeqLen)]
    pub fn max_seq_len(&self) -> usize {
        self.config.max_seq_len
    }

    #[wasm_bindgen(setter, js_name = maxSeqLen)]
    pub fn set_max_seq_len(&mut self, value: usize) {
        self.config.max_seq_len = value;
    }

    #[wasm_bindgen(getter)]
    pub fn gamma(&self) -> f64 {
        self.config.gamma
    }

    #[wasm_bindgen(setter)]
    pub fn set_gamma(&mut self, value: f64) {
        assert!(value.is_finite(), "gamma must be finite");
        self.config.gamma = value;
    }
}

impl TrainingConfig {
    fn assert_valid(&self) {
        assert!(
            self.config.batch_size > 0
                && self.config.learning_rate.is_finite()
                && self.config.gamma.is_finite(),
            "batchSize must be greater than 0, and learningRate and gamma must be finite",
        );
    }

    fn as_fsrs(&self) -> FsrsTrainingConfig {
        self.assert_valid();
        self.config
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct Progress {
    counters: Arc<[AtomicU32; 2]>,
}

#[wasm_bindgen]
impl Progress {
    // The progress vec is length 2. Grep 2291AF52-BEE4-4D54-BAD0-6492DFE368D8
    pub fn new() -> Progress {
        Self {
            counters: Arc::new([AtomicU32::new(0), AtomicU32::new(0)]),
        }
    }

    /// Memory will hold [items_processed, items_total]
    pub fn pointer(&self) -> *const u32 {
        self.counters.as_ptr().cast()
    }
}

impl Default for Progress {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen(js_name = DEFAULT_PARAMETERS)]
pub fn default_parameters() -> Vec<f32> {
    DEFAULT_PARAMETERS.to_vec()
}

#[wasm_bindgen(js_name = checkAndFillParameters)]
pub fn check_and_fill_parameters(parameters: Option<Vec<f32>>) -> Vec<f32> {
    check_fsrs_parameters(parameters.as_deref().unwrap_or(&[])).unwrap()
}

fn copy_progress(
    progress: &Arc<Mutex<CombinedProgressState>>,
    counters: &Arc<[AtomicU32; 2]>,
    force_total: bool,
) {
    let progress = progress.lock().unwrap();
    let current = progress.current() as u32;
    let total = progress.total() as u32;
    counters[0].store(current, Ordering::Release);
    if force_total || counters[1].load(Ordering::Acquire) == 0 {
        counters[1].store(total, Ordering::Release);
    }
}

#[wasm_bindgen(js_name = Fsrs)]
pub struct FSRSwasm {
    model: FSRS,
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
        let model = FSRS::new(parameters.as_deref().unwrap_or(&[])).unwrap();
        Self { model }
    }

    /// `minute_offset` should be the `user's timezone offset from UTC` minus `Anki's "next day starts at"`, in minutes.
    #[wasm_bindgen(js_name = computeParametersAnki)]
    #[allow(clippy::too_many_arguments)]
    pub fn compute_parameters_anki(
        &mut self,
        minute_offset: i32,
        cids: &[i64],
        eases: &[u8],
        ids: &[i64],
        types: &[u8],
        progress: Option<Progress>,
        enable_short_term: bool,
    ) -> Vec<f32> {
        let revlog_entries = to_revlog_entry(cids, eases, ids, types);
        let items = anki_to_fsrs(revlog_entries, minute_offset);
        self.train_and_set_parameters(items, progress, enable_short_term, None, None, None)
    }

    #[wasm_bindgen(js_name = computeParameters)]
    #[allow(clippy::too_many_arguments)]
    pub fn compute_parameters(
        &mut self,
        ratings: &[u32],
        delta_ts: &[u32],
        lengths: &[u32],
        progress: Option<Progress>,
        enable_short_term: bool,
        card_ids: Option<Vec<i64>>,
        num_relearning_steps: Option<usize>,
        training_config: Option<TrainingConfig>,
    ) -> Vec<f32> {
        let items = Self::to_fsrs_items(ratings, delta_ts, lengths);
        self.train_and_set_parameters(
            items,
            progress,
            enable_short_term,
            card_ids,
            num_relearning_steps,
            training_config,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn train_and_set_parameters(
        &mut self,
        items: Vec<FSRSItem>,
        progress: Option<Progress>,
        enable_short_term: bool,
        card_ids: Option<Vec<i64>>,
        num_relearning_steps: Option<usize>,
        training_config: Option<TrainingConfig>,
    ) -> Vec<f32> {
        #[cfg(debug_assertions)]
        warn!("You're training with a debug build... this is going to take a *long* time.");

        let fsrs_progress = CombinedProgressState::new_shared();
        let counters = progress.map(|progress| progress.counters);
        let monitor_done = Arc::new(AtomicBool::new(false));

        if let Some(counters) = counters.clone() {
            let fsrs_progress = fsrs_progress.clone();
            let monitor_done = monitor_done.clone();
            rayon::spawn(move || {
                while !monitor_done.load(Ordering::Acquire) {
                    copy_progress(&fsrs_progress, &counters, false);
                    std::thread::sleep(Duration::from_millis(50));
                }
                copy_progress(&fsrs_progress, &counters, true);
            });
        }

        let parameters = compute_fsrs_parameters(ComputeParametersInput {
            train_set: items,
            card_ids,
            progress: Some(fsrs_progress.clone()),
            enable_short_term,
            num_relearning_steps,
            training_config: training_config.map(|config| config.as_fsrs()),
        })
        .unwrap();
        monitor_done.store(true, Ordering::Release);
        if let Some(counters) = &counters {
            copy_progress(&fsrs_progress, counters, true);
        }

        self.model = FSRS::new(&parameters).unwrap();
        parameters
    }

    #[wasm_bindgen(js_name = memoryState)]
    /// Returns an array of 2 elements: `[stability, difficulty]`
    pub fn memory_state(
        &self,
        ratings: &[u32],
        delta_ts: &[u32],
        starting_state: Option<Vec<f32>>,
    ) -> Vec<f32> {
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
        self._memory_state(item, Self::to_optional_memory_state(starting_state))
    }

    fn _memory_state(&self, item: FSRSItem, starting_state: Option<MemoryState>) -> Vec<f32> {
        let state = self.model.memory_state(item, starting_state).unwrap();
        vec![state.stability, state.difficulty]
    }

    #[wasm_bindgen(js_name = memoryStateFromSm2)]
    pub fn memory_state_from_sm2(
        &self,
        ease_factor: f32,
        interval: f32,
        sm2_retention: f32,
    ) -> Vec<f32> {
        let state = self
            .model
            .memory_state_from_sm2(ease_factor, interval, sm2_retention)
            .unwrap();
        vec![state.stability, state.difficulty]
    }

    #[wasm_bindgen(js_name = memoryStateBatch)]
    pub fn memory_state_batch(
        &self,
        ratings: &[u32],
        delta_ts: &[u32],
        lengths: &[u32],
        starting_states: Option<Vec<f32>>,
    ) -> JsValue {
        let items = Self::to_fsrs_items(ratings, delta_ts, lengths);
        let starting_states = Self::to_optional_memory_states(starting_states, items.len());
        let states = self
            .model
            .memory_state_batch(items, starting_states)
            .unwrap();
        serde_wasm_bindgen::to_value(&states).unwrap()
    }

    #[wasm_bindgen(js_name = historicalMemoryStates)]
    pub fn historical_memory_states(
        &self,
        ratings: &[u32],
        delta_ts: &[u32],
        starting_state: Option<Vec<f32>>,
    ) -> JsValue {
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
        let states = self
            .model
            .historical_memory_states(item, Self::to_optional_memory_state(starting_state))
            .unwrap();
        serde_wasm_bindgen::to_value(&states).unwrap()
    }

    #[wasm_bindgen(js_name = historicalMemoryStateBatch)]
    pub fn historical_memory_state_batch(
        &self,
        ratings: &[u32],
        delta_ts: &[u32],
        lengths: &[u32],
        starting_states: Option<Vec<f32>>,
    ) -> JsValue {
        let items = Self::to_fsrs_items(ratings, delta_ts, lengths);
        let starting_states = starting_states
            .map(|states| Self::to_optional_memory_states(Some(states), items.len()));
        let states = self
            .model
            .historical_memory_state_batch(items, starting_states)
            .unwrap();
        serde_wasm_bindgen::to_value(&states).unwrap()
    }

    #[wasm_bindgen(js_name = memoryStateAnki)]
    /// `minute_offset` should be the `user's timezone offset from UTC` minus `Anki's "next day starts at"`, in minutes.
    /// Returns an array of 2 elements: `[stability, difficulty]`
    pub fn memory_state_anki(
        &self,
        minute_offset: i32,
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
        assert_eq!(len, 1, "Expected 1 card, but was given {len}");

        let revlog_entries = to_revlog_entry(cids, eases, ids, types);
        anki_to_fsrs(revlog_entries, minute_offset)
            .pop()
            .map(|item| self._memory_state(item, None))
    }

    #[wasm_bindgen(js_name = nextInterval)]
    pub fn next_interval(
        &self,
        stability: Option<f32>,
        desired_retention: f32,
        rating: u32,
    ) -> f32 {
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
    ) -> JsValue {
        let current_memory_state = stability.and_then(|stability| {
            difficulty.map(|difficulty| MemoryState {
                stability,
                difficulty,
            })
        });
        let next_states = self
            .model
            .next_states(current_memory_state, desired_retention, days_elapsed)
            .unwrap();
        serde_wasm_bindgen::to_value(&next_states).unwrap()
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

    fn to_optional_memory_state(state: Option<Vec<f32>>) -> Option<MemoryState> {
        state.map(|state| {
            assert_eq!(
                state.len(),
                2,
                "A memory state must contain exactly 2 elements: [stability, difficulty]",
            );
            MemoryState {
                stability: state[0],
                difficulty: state[1],
            }
        })
    }

    fn to_optional_memory_states(
        states: Option<Vec<f32>>,
        item_count: usize,
    ) -> Vec<Option<MemoryState>> {
        match states {
            None => vec![None; item_count],
            Some(states) => {
                assert_eq!(
                    states.len(),
                    item_count * 2,
                    "Starting states must contain 2 elements per item: [stability, difficulty]",
                );
                states
                    .chunks_exact(2)
                    .map(|state| {
                        if state[0].is_nan() && state[1].is_nan() {
                            None
                        } else {
                            Some(MemoryState {
                                stability: state[0],
                                difficulty: state[1],
                            })
                        }
                    })
                    .collect()
            }
        }
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
