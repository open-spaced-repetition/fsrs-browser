use fsrs::{FSRSItem, FSRSReview};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RevlogEntry {
    pub id: i64,
    pub cid: i64,
    pub button_chosen: u8,
    pub last_interval: i32,
    pub review_kind: RevlogReviewKind,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
pub enum RevlogReviewKind {
    #[default]
    Learning = 0,
    Review = 1,
    Relearning = 2,
    Filtered = 3,
    Manual = 4,
}

impl From<u8> for RevlogReviewKind {
    fn from(value: u8) -> Self {
        match value {
            0 => Self::Learning,
            1 => Self::Review,
            2 => Self::Relearning,
            3 => Self::Filtered,
            4 => Self::Manual,
            _ => panic!("Unable to convert {value} into a RevlogReviewKind."),
        }
    }
}

fn remove_revlog_before_last_first_learn(entries: Vec<RevlogEntry>) -> Vec<RevlogEntry> {
    let mut last_first_learn_index = 0;
    for (index, entry) in entries.iter().enumerate().rev() {
        if entry.review_kind == RevlogReviewKind::Learning {
            last_first_learn_index = index;
        } else if last_first_learn_index != 0 {
            break;
        }
    }
    if entries
        .get(last_first_learn_index)
        .is_some_and(|entry| entry.review_kind == RevlogReviewKind::Learning)
    {
        entries[last_first_learn_index..].to_vec()
    } else {
        vec![]
    }
}

fn local_day_index(timestamp_millis: i64, minute_offset: i32) -> i64 {
    (timestamp_millis + i64::from(minute_offset) * 60 * 1000).div_euclid(86_400_000)
}

fn convert_to_fsrs_items(
    mut entries: Vec<RevlogEntry>,
    minute_offset: i32,
) -> Vec<(i64, FSRSItem)> {
    entries = remove_revlog_before_last_first_learn(entries);

    for i in 1..entries.len() {
        let current = local_day_index(entries[i].id, minute_offset);
        let previous = local_day_index(entries[i - 1].id, minute_offset);
        entries[i].last_interval = (current - previous) as i32;
    }

    entries
        .iter()
        .enumerate()
        .skip(1)
        .map(|(idx, entry)| {
            let reviews = entries
                .iter()
                .take(idx + 1)
                .map(|review| FSRSReview {
                    rating: review.button_chosen as u32,
                    delta_t: review.last_interval as u32,
                })
                .collect();
            (entry.id, FSRSItem { reviews })
        })
        .filter(|(_, item)| item.reviews.last().is_some_and(|review| review.delta_t > 0))
        .collect()
}

pub fn to_revlog_entry(cids: &[i64], eases: &[u8], ids: &[i64], types: &[u8]) -> Vec<RevlogEntry> {
    let mut entries = ids
        .iter()
        .enumerate()
        .map(|(i, _id)| RevlogEntry {
            id: ids[i],
            cid: cids[i],
            button_chosen: eases[i],
            last_interval: 0,
            review_kind: types[i].into(),
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| (entry.cid, entry.id));
    entries
}

pub fn anki_to_fsrs(revlogs: Vec<RevlogEntry>, minute_offset: i32) -> Vec<FSRSItem> {
    let mut items = Vec::<(i64, FSRSItem)>::new();
    let mut current_card = Vec::<RevlogEntry>::new();
    let mut current_cid = None;

    for revlog in revlogs {
        if current_cid.is_some_and(|cid| cid != revlog.cid) {
            items.extend(convert_to_fsrs_items(current_card, minute_offset));
            current_card = Vec::new();
        }
        current_cid = Some(revlog.cid);
        current_card.push(revlog);
    }

    if !current_card.is_empty() {
        items.extend(convert_to_fsrs_items(current_card, minute_offset));
    }

    items.sort_by_key(|(id, _)| *id);
    items.into_iter().map(|(_, item)| item).collect()
}
