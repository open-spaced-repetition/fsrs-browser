import init, { Fsrs } from 'fsrs-browser/fsrs_browser'

export async function testSerialization() {
  await init()
	const lengths = new Uint32Array(testItems.map((item) => item.reviews.length))
	const ratings = new Uint32Array(
		testItems.flatMap((item) => item.reviews.map((r) => r.rating)),
	)
	const deltaTs = new Uint32Array(
		testItems.flatMap((item) => item.reviews.map((r) => r.delta_t)),
	)
	if ('testSerialization' in Fsrs) {
		try {
			Fsrs.testSerialization(ratings, deltaTs, lengths)
			return true
		} catch (e) {
			console.error(e)
			return false
		}
	} else {
		console.error(
			"fsrs-browser was built in 'release' mode. This test will only work in 'dev' mode. Rebuild with `./dev.sh` and try again.",
		)
		return false
	}
}

interface FSRSReview {
	rating: number
	delta_t: number
}

interface FSRSItem {
	reviews: FSRSReview[]
}

const testItems: FSRSItem[] = [
	{
		reviews: [
			{
				rating: 4,
				delta_t: 0,
			},
			{
				rating: 3,
				delta_t: 5,
			},
		],
	},
	{
		reviews: [
			{
				rating: 4,
				delta_t: 0,
			},
			{
				rating: 3,
				delta_t: 5,
			},
			{
				rating: 3,
				delta_t: 11,
			},
		],
	},
	{
		reviews: [
			{
				rating: 4,
				delta_t: 0,
			},
			{
				rating: 3,
				delta_t: 2,
			},
		],
	},
	{
		reviews: [
			{
				rating: 4,
				delta_t: 0,
			},
			{
				rating: 3,
				delta_t: 2,
			},
			{
				rating: 3,
				delta_t: 6,
			},
		],
	},
	{
		reviews: [
			{
				rating: 4,
				delta_t: 0,
			},
			{
				rating: 3,
				delta_t: 2,
			},
			{
				rating: 3,
				delta_t: 6,
			},
			{
				rating: 3,
				delta_t: 16,
			},
		],
	},
	{
		reviews: [
			{
				rating: 4,
				delta_t: 0,
			},
			{
				rating: 3,
				delta_t: 2,
			},
			{
				rating: 3,
				delta_t: 6,
			},
			{
				rating: 3,
				delta_t: 16,
			},
			{
				rating: 3,
				delta_t: 39,
			},
		],
	},
	{
		reviews: [
			{
				rating: 1,
				delta_t: 0,
			},
			{
				rating: 1,
				delta_t: 1,
			},
		],
	},
	{
		reviews: [
			{
				rating: 1,
				delta_t: 0,
			},
			{
				rating: 1,
				delta_t: 1,
			},
			{
				rating: 3,
				delta_t: 1,
			},
		],
	},
]
