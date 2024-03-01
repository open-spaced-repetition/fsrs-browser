import wasm, { initThreadPool, Fsrs } from 'fsrs-browser/fsrs_browser'
import initSqlJs, { type Database } from 'sql.js'
import sqliteWasmUrl from './assets/sql-wasm.wasm?url'
import * as papa from 'papaparse'

// If you're looking at this code as a template/example to use in your own app,
// note that we initialize fsrs-browser in App.tsx. Grep for 'initThreadPool'.

// @ts-ignore https://github.com/rustwasm/console_error_panic_hook#errorstacktracelimit
Error.stackTraceLimit = 30
const sqlJs = initSqlJs({
	locateFile: () => sqliteWasmUrl,
})

export const train = async (event: { data: ArrayBuffer | File }) => {
	if (event.data instanceof ArrayBuffer) {
		await loadSqliteAndTrain(event.data)
	} else if (event.data instanceof File) {
		loadCsvAndTrain(event.data)
	}
}

async function loadSqliteAndTrain(ab: ArrayBuffer) {
	console.time('load time')
	const db = await getDb(ab)
	let baseQuery = `FROM revlog
    WHERE id < ${Date.now()}
    AND cid < ${Date.now()}
    AND cid IN (
        SELECT id
        FROM cards
        WHERE queue != 0
    )
    AND (type <> 4 AND ease <> 0)
    AND (type <> 3 OR  factor <> 0)
    order by cid`
	try {
		const countQuery = db.prepare(`SELECT count(*) ${baseQuery}`)
		let count = 0
		while (countQuery.step()) {
			count = countQuery.get()[0] as number
		}
		countQuery.free()
		let i = 0
		const cids = new BigInt64Array(count)
		const eases = new Uint8Array(count)
		const ids = new BigInt64Array(count)
		const types = new Uint8Array(count)
		const trainQuery = db.prepare(`SELECT * ${baseQuery}`)
		while (trainQuery.step()) {
			const row = trainQuery.getAsObject()
			cids[i] = BigInt(row.cid as number)
			eases[i] = row.ease as number
			ids[i] = BigInt(row.id as number)
			types[i] = row.type as number
			i++
		}
		trainQuery.free()
		console.timeEnd('load time')
		computeWeights(cids, eases, ids, types)
	} finally {
		db.close()
	}
}

interface ParseData {
	review_time: string
	card_id: string
	review_rating: string
	review_duration: string
	review_state: string
}

// An example CSV may be obtained from https://github.com/open-spaced-repetition/fsrs4anki/issues/450
// Specifically https://github.com/open-spaced-repetition/fsrs4anki/files/12515294/revlog.csv
function loadCsvAndTrain(csv: File) {
	console.time('load time')
	const cids: bigint[] = []
	const eases: number[] = []
	const ids: bigint[] = []
	const types: number[] = []
	papa.parse<ParseData>(csv, {
		header: true,
		delimiter: ',',
		step: function ({ data }) {
			if (data.card_id === undefined) return
			cids.push(BigInt(data.card_id))
			ids.push(BigInt(data.review_time))
			eases.push(Number(data.review_rating))
			types.push(Number(data.review_state))
		},
		complete: function () {
			console.timeEnd('load time')
			computeWeights(
				new BigInt64Array(cids),
				new Uint8Array(eases),
				new BigInt64Array(ids),
				new Uint8Array(types),
			)
		},
	})
}

async function getDb(ab: ArrayBuffer): Promise<Database> {
	const sql = await sqlJs
	return new sql.Database(new Uint8Array(ab))
}

function computeWeights(
	cids: BigInt64Array,
	eases: Uint8Array,
	ids: BigInt64Array,
	types: Uint8Array,
) {
	let fsrs = new Fsrs()
	console.time('full training time')
	let weights = fsrs.computeWeightsAnki(cids, eases, ids, types)
	console.timeEnd('full training time')
	console.log('trained weights are', weights)
	console.log('revlog count', cids.length)
}
