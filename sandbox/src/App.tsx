import { createResource, type Component } from 'solid-js'
import init, { Fsrs } from 'fsrs-wasm/fsrs_wasm'

const App: Component = () => {
	let [fsrs] = createResource(() => init().then(() => new Fsrs()))
	return (
		<>
			<h1>FSRS WASM Example</h1>
			<button
				onClick={() => {
					Error.stackTraceLimit = 20
					const deltaTs = new Uint32Array([0, 0, 0, 4, 4, 0, 2, 3, 0, 0])
					const ratings = new Uint32Array([3, 3, 3, 3, 1, 3, 4, 3, 3, 3])
					const lengths = new Uint32Array([8, 2])
					const result = fsrs().computeWeights(ratings, deltaTs, lengths)
					console.log('Compute weights', result)
				}}
			>
				Compute Weights
			</button>
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
		</>
	)
}

export default App
