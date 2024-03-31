import { createResource, type Component } from 'solid-js'
import init, { Fsrs, initThreadPool } from 'fsrs-browser/fsrs_browser'
import Train from './train.ts?worker'
import { testSerialization } from './testSerialization'

const App: Component = () => {
	let [fsrs] = createResource(async () => {
		await init()
		await initThreadPool(navigator.hardwareConcurrency)
		return new Fsrs()
	})
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
					new Train().postMessage(data, [data])
				}}
			>
				Train with example file
			</button>
			<label>
				Train with custom file
				<input type='file' onChange={customFile} accept='.anki21, .csv' />
			</label>
			<button onclick={testSerialization}>
				<div>Test Serialization</div>
				<div>(fails if fsrs-browser was built in release mode)</div>
			</button>
		</div>
	)
}

async function customFile(
	event: Event & {
		currentTarget: HTMLInputElement
		target: HTMLInputElement
	},
): Promise<void> {
	const file =
		// My mental static analysis says to use `currentTarget`, but it seems to randomly be null, hence `target`. I'm confused but whatever.
		event.target.files?.item(0) ?? throwExp('There should be a file selected')
	if (file.name.endsWith('.csv')) {
		new Train().postMessage(file)
	} else {
		let ab = await file.arrayBuffer()
		new Train().postMessage(ab, [ab])
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
