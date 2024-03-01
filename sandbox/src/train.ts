import wasm, { initThreadPool, Fsrs } from 'fsrs-browser/fsrs_browser'
import initSqlJs, { type Database } from 'sql.js'
import sqliteWasmUrl from './assets/sql-wasm.wasm?url'

// @ts-ignore https://github.com/rustwasm/console_error_panic_hook#errorstacktracelimit
Error.stackTraceLimit = 30

const sqlJs = initSqlJs({
	locateFile: () => sqliteWasmUrl,
})

export const train = async (event: { data: 'autotrain' | ArrayBuffer }) => {
	if (event.data === 'autotrain') {
		let db = await fetch('/collection.anki21')
		let ab = await db.arrayBuffer()
		loadSqliteAndRun(ab)
	} else if (event.data instanceof ArrayBuffer) {
		loadSqliteAndRun(event.data)
	}
}

async function loadSqliteAndRun(ab: ArrayBuffer) {
	await wasm()
	await initThreadPool(navigator.hardwareConcurrency)
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
		console.timeEnd('full training time')
		console.log('trained weights are', weights)
		console.log('revlog count', count)
	} finally {
		db.close()
	}
}

async function getDb(ab: ArrayBuffer): Promise<Database> {
	const sql = await sqlJs
	return new sql.Database(new Uint8Array(ab))
}

async function sleep(ms: number): Promise<unknown> {
	return await new Promise((resolve) => setTimeout(resolve, ms))
}
