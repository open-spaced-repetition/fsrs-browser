import init, {
	initThreadPool,
	Fsrs,
	type ModelVersion,
	Progress,
	TrainingConfig,
	InitOutput,
} from 'fsrs-browser/fsrs_browser'
import initSqlJs, { type Database } from 'sql.js'
import sqliteWasmUrl from './assets/sql-wasm.wasm?url'
import * as papa from 'papaparse'

// @ts-ignore https://github.com/rustwasm/console_error_panic_hook#errorstacktracelimit
Error.stackTraceLimit = 30
const sqlJs = initSqlJs({
	locateFile: () => sqliteWasmUrl,
})

let initOutput: InitOutput = null

export interface TrainingRequest {
	data: ArrayBuffer | File
	version: ModelVersion
}

self.onmessage = async (event: MessageEvent<TrainingRequest>) => {
	if (initOutput == null) {
		initOutput = await init()
		await initThreadPool(navigator.hardwareConcurrency)
	}
	const { data, version } = event.data
	if (data instanceof ArrayBuffer) {
		await loadSqliteAndTrain(data, version)
	} else if (data instanceof File) {
		loadCsvAndTrain(data, version)
	}
}

async function loadSqliteAndTrain(ab: ArrayBuffer, version: ModelVersion) {
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
		computeParameters(cids, eases, ids, types, version)
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
function loadCsvAndTrain(csv: File, version: ModelVersion) {
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
			// Convert review_state to RevlogReviewKind
			// 0,1 -> Learning (0)
			// 2 -> Review (1)
			// 3 -> Relearning (2)
			const state = Number(data.review_state)
			types.push(state <= 1 ? 0 : state === 2 ? 1 : 2)
		},
		complete: function () {
			console.timeEnd('load time')
			computeParameters(
				new BigInt64Array(cids),
				new Uint8Array(eases),
				new BigInt64Array(ids),
				new Uint8Array(types),
				version,
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
	version: ModelVersion,
) {
	let fsrs = new Fsrs()
	console.time('full training time')
	const progress = Progress.new()
	// This worker handles one training run. The UI releases its handle after its final read.
	self.onmessage = ({ data }) => {
		if (data === 'Release') {
			progress.free()
			self.close()
		}
	}
	self.postMessage({
		tag: 'Start',
		buffer: initOutput.memory.buffer,
		pointer: progress.pointer(),
	} satisfies ProgressMessage)
	// MDN states:
	//     The number of minutes returned by getTimezoneOffset() is positive if the
	//     local time zone is behind UTC, and negative if the local time zone is ahead of UTC.
	// This is useful when going from our timezone to UTC; our local time + offset = UTC.
	// However, we want to go from UTC to our timezone. (Anki revlog id is UTC, and we want to convert it to local time.)
	// So we flip the sign of `getTimezoneOffset()`.
	let timeZoneMinutesOffset = new Date().getTimezoneOffset() * -1
	let ankiNextDayStartsAtMinutes = 4 * 60
	let trainingConfig = new TrainingConfig()
	let parameters: Float32Array | undefined
	try {
		parameters = fsrs.computeParametersAnki(
			// Count reviews before Anki's next-day boundary toward the previous day.
			timeZoneMinutesOffset - ankiNextDayStartsAtMinutes,
			cids,
			eases,
			ids,
			types,
			progress.clone(),
			true,
			null,
			trainingConfig,
			version,
		)
		console.timeEnd('full training time')
		console.log('trained parameters are', parameters)
		console.log('revlog count', cids.length)
	} finally {
		self.postMessage({ tag: 'Stop', parameters } satisfies ProgressMessage)
		// grep D91EEC72-FCBC-4140-8ADC-9CF2016A56C5
		// WeakRef-capable browsers can reclaim the wrapper, but free() releases it immediately.
		fsrs.free()
	}
}

export type ProgressMessage =
	| {
			tag: 'Start'
			buffer: ArrayBuffer
			pointer: number
	  }
	| {
			tag: 'Stop'
			parameters: Float32Array | undefined
	  }
