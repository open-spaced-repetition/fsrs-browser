import wasm, { initThreadPool, Fsrs } from 'fsrs-browser/fsrs_browser'
import initSqlJs, { type Database } from 'sql.js'
import sqliteWasmUrl from './assets/sql-wasm.wasm?url'
import * as papa from "papaparse";

// @ts-ignore https://github.com/rustwasm/console_error_panic_hook#errorstacktracelimit
Error.stackTraceLimit = 30
const sqlJs = initSqlJs({
	locateFile: () => sqliteWasmUrl,
})

let train_count = 0;
export const train = async (event: { data: 'autotrain' | ArrayBuffer | File }) => {
    await init()
	if (event.data === 'autotrain') {
		let db = await fetch('/collection.anki21')
		let ab = await db.arrayBuffer()
		loadSqliteAndRun(ab)
	} else if (event.data instanceof ArrayBuffer) {
		loadSqliteAndRun(event.data)
    } else if (event.data instanceof File) {
        csvTrain(event.data)
    }
}

async function init() {
    train_count++;
    console.log('train_count', train_count)
    if (train_count > 1) {
        return
    }
    // Only the first initialization is allowed.
    await wasm()
    await initThreadPool(navigator.hardwareConcurrency)
}


async function loadSqliteAndRun(ab: ArrayBuffer) {
	await sleep(1000) // the workers need time to spin up. TODO, post an init message and await a response. Also maybe move worker construction to Javascript.
	console.time('full training time')
	let fsrs = new Fsrs()
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
		let weights = fsrs.computeWeightsAnki(cids, eases, ids, types)
        fsrs.free()
		console.timeEnd('full training time')
		console.log('trained weights are', weights)
		console.log('revlog count', count)
	} finally {
		db.close()
	}
}


// use the csv file to train the model
// dataset: https://github.com/open-spaced-repetition/fsrs4anki/issues/450
interface ParseData {
    review_time: string,
    card_id: string,
    review_rating: string,
    review_duration: string,
    review_state: string
}

interface csvTrainDataItem {
    card_id: bigint,
    review_time: bigint,
    review_state: number,
    review_rating: number
}
async function csvTrain(csv: File) {
    await sleep(1000) // the workers need time to spin up. TODO, post an init message and await a response. Also maybe move worker construction to Javascript.
    console.time('full training time')
    const result: csvTrainDataItem[] = [];
    const fsrs = new Fsrs()
    papa.parse<ParseData>(csv, {
        header: true,
        delimiter: ",",
        step: function (row) {
            const data = row.data;
            if (data.card_id === undefined) return;
            result.push({
                card_id: BigInt(data.card_id),
                review_time: BigInt(data.review_time),
                review_state: Number(data.review_state),
                review_rating: Number(data.review_rating),
            });
        },
        complete: function (_) {
            const cids: BigInt64Array = new BigInt64Array([
                ...result.map((r) => r.card_id),
            ]);
            const eases: Uint8Array = new Uint8Array([
                ...result.map((r) => r.review_rating),
            ]);
            const ids: BigInt64Array = new BigInt64Array([
                ...result.map((r) => r.review_time),
            ]);
            const types: Uint8Array = new Uint8Array([
                ...result.map((r) => r.review_state),
            ]);
            const weights = fsrs.computeWeightsAnki(cids, eases, ids, types)
            fsrs.free()
            console.timeEnd('full training time')
            console.log('trained weights are', weights)
            console.log('revlog count', result.length)
        },
    });
}

async function getDb(ab: ArrayBuffer): Promise<Database> {
	const sql = await sqlJs
	return new sql.Database(new Uint8Array(ab))
}

async function sleep(ms: number): Promise<unknown> {
	return await new Promise((resolve) => setTimeout(resolve, ms))
}
