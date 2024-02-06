import { createResource, type Component } from 'solid-js'
import init, { Fsrs } from 'fsrs-browser/fsrs_browser'

const App: Component = () => {
	let [fsrs] = createResource(() => init().then(() => new Fsrs()))
	return (
		<>
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
		</>
	)
}

export default App
