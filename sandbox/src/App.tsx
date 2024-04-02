import {
	Accessor,
	Setter,
	VoidComponent,
	createResource,
	createSignal,
	type Component,
} from 'solid-js'
import init, { Fsrs, initThreadPool } from 'fsrs-browser/fsrs_browser'
import Train from './train.ts?worker'
import { testSerialization } from './testSerialization'
import { ProgressMessage } from './train'

const App: Component = () => {
	let [fsrs] = createResource(async () => {
		await init()
		await initThreadPool(navigator.hardwareConcurrency)
		return new Fsrs()
	})
	let [itemsProcessed, setItemsProcessed] = createSignal(0)
	let [itemsTotal, setItemsTotal] = createSignal(0)
	return (
		<div style={{ display: 'flex', 'flex-direction': 'column' }}>
			<h1>FSRS Browser Example</h1>
			<button
				onClick={() => {
					const ratings = new Uint32Array([3, 3, 3])
					const delta_ts = new Uint32Array([0, 3, 6])
					const result = fsrs().memoryState(ratings, delta_ts)
					console.log('Memory state:', result)
				}}
			>
				Calculate Memory State
			</button>
			<button
				onclick={() => {
					const stability = 1.5 // or undefined
					const desired_retention = 0.9
					const rating = 3
					const result = fsrs().nextInterval(
						stability,
						desired_retention,
						rating,
					)
					console.log('Next interval:', result)
				}}
			>
				Calculate Next Interval
			</button>
			<button
				onclick={async () => {
					let db = await fetch('/collection.anki21')
					let data = await db.arrayBuffer()
					trainOn(data, setItemsProcessed, setItemsTotal, itemsTotal)
				}}
			>
				Train with example file
			</button>
			<label>
				Train with custom file
				<input
					type='file'
					onChange={(event) => {
						const file =
							// My mental static analysis says to use `currentTarget`, but it seems to randomly be null, hence `target`. I'm confused but whatever.
							event.target.files?.item(0) ??
							throwExp('There should be a file selected')
						trainOn(file, setItemsProcessed, setItemsTotal, itemsTotal)
					}}
					accept='.anki21, .csv'
				/>
			</label>
			<label for='train'>Train progress:</label>
			<progress
				id='train'
				max={itemsTotal()}
				value={itemsProcessed()}
			></progress>
			{itemsProcessed()}/{itemsTotal()}
			<button onclick={testSerialization}>
				<div>Test Serialization</div>
				<div>(fails if fsrs-browser was built in release mode)</div>
			</button>
		</div>
	)
}

async function trainOn(
	file_buffer: File | ArrayBuffer,
	setItemsProcessed: Setter<number>,
	setItemsTotal: Setter<number>,
	itemsTotal: Accessor<number>,
): Promise<void> {
	let t = new Train()
	let intervalId = 0
	t.addEventListener('message', (m) => {
		let msg = m.data as ProgressMessage
		if (msg.tag === 'Start') {
			intervalId = window.setInterval(() => {
				// The progress vec is length 2. Grep 2291AF52-BEE4-4D54-BAD0-6492DFE368D8
				const progress = new Uint32Array(msg.buffer, msg.pointer, 2)
				setItemsProcessed(progress[0])
				setItemsTotal(progress[1])
			}, 100)
		} else if (msg.tag === 'Stop') {
			clearInterval(intervalId)
			// It is not guaranteed that the final `itemsProcessed` message is equal to `itemsTotal`
			// so we set it to the max upon `Stop` to make the bar full.
			setItemsProcessed(itemsTotal())
		}
	})
	if (file_buffer instanceof File) {
		if (file_buffer.name.endsWith('.csv')) {
			t.postMessage(file_buffer)
		} else {
			let ab = await file_buffer.arrayBuffer()
			t.postMessage(ab, [ab])
		}
	} else {
		t.postMessage(file_buffer, [file_buffer])
	}
}

export default App

// https://stackoverflow.com/a/65666402
export function throwExp(error: unknown): never {
	if (typeof error === 'string') {
		throw new Error(error)
	}
	throw error
}
