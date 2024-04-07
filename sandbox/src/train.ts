import init, {
	initThreadPool,
	Fsrs,
	Progress,
	InitOutput,
} from 'fsrs-browser/fsrs_browser'
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

let initOutput: InitOutput = null

self.onmessage = async (event: MessageEvent<unknown>) => {
	if (initOutput == null) {
		initOutput = await init()
		await initThreadPool(navigator.hardwareConcurrency)
	}
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
		computeParameters(cids, eases, ids, types)
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
			computeParameters(
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

function computeParameters(
	cids: BigInt64Array,
	eases: Uint8Array,
	ids: BigInt64Array,
	types: Uint8Array,
) {
	let fsrs = new Fsrs()
	console.time('full training time')
	// Rust will GC this `progress` struct upon the completion of `computeParametersAnki`.
	let progress = Progress.new()
	self.postMessage({
		tag: 'Start',
		buffer: initOutput.memory.buffer,
		// When `progress` is GCed, `pointer()` will point to arbitrary memory.
		// Therefore no semantics are guaranteed after the completion of `computeParametersAnki`.
		// Do not read from memory after `Stop` is posted!
		pointer: progress.pointer(),
	} satisfies ProgressMessage)
	let parameters = fsrs.computeParametersAnki(cids, eases, ids, types, progress)
	self.postMessage({
		tag: 'Stop',
		parameters,
	} satisfies ProgressMessage)
	console.timeEnd('full training time')
	console.log('trained parameters are', parameters)
	console.log('revlog count', cids.length)
}

export type ProgressMessage =
	| {
			tag: 'Start'
			buffer: ArrayBuffer
			pointer: number
	  }
	| {
			tag: 'Stop'
			parameters: Float32Array
	  }
