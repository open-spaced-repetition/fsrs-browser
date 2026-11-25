import { createSignal, type Component } from 'solid-js'
import init, {
	DEFAULT_PARAMETERS,
	FSRS6_DEFAULT_PARAMETERS,
	Fsrs,
	ModelVersion,
	TrainingConfig,
	checkAndFillParameters,
	getProgress,
} from 'fsrs-browser/fsrs_browser'
import Train from './train.ts?worker'
import { testSerialization } from './testSerialization'
import type { ProgressMessage, TrainingRequest } from './train'

const [modelVersion, setModelVersion] = createSignal<ModelVersion>(
	ModelVersion.Fsrs7,
)
let trainingRun = 0
let [itemsProcessed, setItemsProcessed] = createSignal(0)
let [itemsTotal, setItemsTotal] = createSignal(0)
let [memoryState, setMemoryState] = createSignal('')
let [nextInterval, setNextInterval] = createSignal('')
let [parameters, setParameters] = createSignal('')
let [serializationPassed, setSerializationPassed] = createSignal<
	boolean | null
>(null)
let [extendedApiPassed, setExtendedApiPassed] = createSignal<boolean | null>(
	null,
)

const App: Component = () => {
	const selectedModel = () =>
		new Fsrs(
			modelVersion() === ModelVersion.Fsrs6
				? FSRS6_DEFAULT_PARAMETERS()
				: undefined,
		)
	return (
		<div style={{ display: 'flex', 'flex-direction': 'column' }}>
			<h1>FSRS Browser Example</h1>
			<label>
				FSRS version{' '}
				<select
					value={modelVersion()}
					onChange={(event) => {
						setModelVersion(Number(event.currentTarget.value))
						trainingRun++
						setMemoryState('')
						setNextInterval('')
						setParameters('')
						setItemsProcessed(0)
						setItemsTotal(0)
					}}
				>
					<option value={ModelVersion.Fsrs7}>FSRS-7</option>
					<option value={ModelVersion.Fsrs6}>FSRS-6</option>
				</select>
			</label>
			<button
				onClick={async () => {
					await init()
					const ratings = new Uint32Array([3, 3, 3])
					const delta_ts = new Float32Array([0, 3, 6])
					const fsrs = selectedModel()
					const result = fsrs.memoryState(ratings, delta_ts)
					setMemoryState(result.toString())
					console.log('Memory state:', result)
					fsrs.free() // for details grep D91EEC72-FCBC-4140-8ADC-9CF2016A56C5
				}}
			>
				Calculate Memory State
			</button>
			<div id='memoryStateResponse' style={{ height: '5em' }}>
				{memoryState()}
			</div>
			<button
				onclick={async () => {
					await init()
					const stability = 1.5 // or undefined
					const desired_retention = 0.9
					const rating = 3
					const fsrs = selectedModel()
					const result = fsrs.nextInterval(stability, desired_retention, rating)
					console.log('Next interval:', result)
					setNextInterval(result.toString())
					fsrs.free() // for details grep D91EEC72-FCBC-4140-8ADC-9CF2016A56C5
				}}
			>
				Calculate Next Interval
			</button>
			<div id='nextIntervalResponse' style={{ height: '5em' }}>
				{nextInterval()}
			</div>
			<button
				onclick={() =>
					trainOn(fetch('/collection.anki21').then((db) => db.arrayBuffer()))
				}
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
						trainOn(file)
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
			<div id='progressNumbers'>
				{itemsProcessed()}/{itemsTotal()}
			</div>
			<div id='parametersResult' style={{ height: '5em' }}>
				{parameters()}
			</div>
			<button
				onclick={async () => {
					let r = await testSerialization()
					setSerializationPassed(r)
				}}
			>
				<div>Test Serialization</div>
				<div>(fails if fsrs-browser was built in release mode)</div>
			</button>
			<div id='serializationPassedResult' style={{ height: '5em' }}>
				{serializationPassed() === null
					? ''
					: serializationPassed()
						? 'Passed!'
						: 'Failed!'}
			</div>
			<button
				onclick={async () => {
					setExtendedApiPassed(await checkExtendedApi())
				}}
			>
				Check Extended API
			</button>
			<div id='extendedApiPassedResult' style={{ height: '5em' }}>
				{extendedApiPassed() === null
					? ''
					: extendedApiPassed()
						? 'Passed!'
						: 'Failed!'}
			</div>
		</div>
	)
}

interface MemoryState {
	stability: number
	difficulty: number
	stability_fast: number
}

async function checkExtendedApi(): Promise<boolean> {
	await init()
	const defaults = DEFAULT_PARAMETERS()
	const fsrs6Defaults = FSRS6_DEFAULT_PARAMETERS()
	const filled = checkAndFillParameters()
	const defaultConfig = new TrainingConfig()

	const fsrs6 = new Fsrs(fsrs6Defaults)
	const fsrs6Version = fsrs6.version
	const fsrs = new Fsrs()
	const fsrsVersion = fsrs.version

	// Elapsed days may be fractional: FSRS-7 keeps the fraction, FSRS-6 rounds to whole days.
	const memoryAfter = (model: Fsrs, days: number) =>
		Array.from(
			model.memoryState(new Uint32Array([3, 3]), new Float32Array([0, days])),
		)
	const sameState = (a: number[], b: number[]) =>
		a.length === b.length && a.every((value, i) => value === b[i])
	const fsrs7KeepsFraction = !sameState(
		memoryAfter(fsrs, 2.5),
		memoryAfter(fsrs, 2),
	)
	const fsrs6RoundsDays = sameState(
		memoryAfter(fsrs6, 2.4),
		memoryAfter(fsrs6, 2),
	)
	const nextStatesWork = (model: Fsrs) => {
		const next = model.nextStates(10, 5, 0.9, 1.5) as {
			good: { interval: number; memory: MemoryState }
		}
		return (
			Number.isFinite(next.good.interval) &&
			Number.isFinite(next.good.memory.stability_fast)
		)
	}
	const fractionalNextStates = nextStatesWork(fsrs) && nextStatesWork(fsrs6)
	fsrs6.free()
	const sm2 = fsrs.memoryStateFromSm2(2.5, 10, 0.9)
	const ratings = new Uint32Array([4, 3, 4, 3, 1, 3])
	const deltaTs = new Float32Array([0, 1, 0, 2, 0, 1])
	const lengths = new Uint32Array([2, 2, 2])
	const emptyStartingStates = new Float32Array([
		Number.NaN,
		Number.NaN,
		Number.NaN,
		Number.NaN,
		Number.NaN,
		Number.NaN,
	])
	const batch = fsrs.memoryStateBatch(
		ratings,
		deltaTs,
		lengths,
		emptyStartingStates,
	) as MemoryState[]
	const historical = fsrs.historicalMemoryStates(
		new Uint32Array([4, 3]),
		new Float32Array([0, 1]),
		sm2,
	) as MemoryState[]
	const historicalFromPair = fsrs.historicalMemoryStates(
		new Uint32Array([4, 3]),
		new Float32Array([0, 1]),
		sm2.slice(0, 2),
	) as MemoryState[]
	const historicalBatch = fsrs.historicalMemoryStateBatch(
		ratings,
		deltaTs,
		lengths,
	) as MemoryState[][]

	// `computeParameters` takes ownership of the config, so create one per call.
	const trainingConfig = () => {
		const config = new TrainingConfig()
		config.numEpochs = 1
		config.batchSize = 2
		config.seed = 2023n
		return config
	}
	const train = (modelVersion?: ModelVersion) =>
		fsrs.computeParameters(
			ratings,
			deltaTs,
			lengths,
			null,
			true,
			new BigInt64Array([1n, 2n, 3n]),
			1,
			trainingConfig(),
			modelVersion,
		)
	const parameters = train()
	const fsrs6Parameters = train(ModelVersion.Fsrs6)
	const nextInterval = fsrs.nextInterval(undefined, 0.9, 3)
	fsrs.free()

	return (
		defaults.length === 34 &&
		fsrs6Defaults.length === 21 &&
		filled.length === 34 &&
		defaultConfig.numEpochs === 0 &&
		defaultConfig.learningRate === 0 &&
		fsrsVersion === ModelVersion.Fsrs7 &&
		fsrs6Version === ModelVersion.Fsrs6 &&
		fsrs7KeepsFraction &&
		fsrs6RoundsDays &&
		fractionalNextStates &&
		sm2.length === 3 &&
		batch.length === 3 &&
		batch.every((state) => Number.isFinite(state.stability_fast)) &&
		historical.length === 3 &&
		historicalFromPair.length === 3 &&
		historicalFromPair.every((state) =>
			Number.isFinite(state.stability_fast),
		) &&
		historicalBatch.length === 3 &&
		parameters.length === 34 &&
		fsrs6Parameters.length === 21 &&
		Number.isFinite(nextInterval)
	)
}

async function trainOn(input: File | Promise<ArrayBuffer>): Promise<void> {
	const run = ++trainingRun
	const version = modelVersion()
	const file = await input
	const data =
		file instanceof File && !file.name.endsWith('.csv')
			? await file.arrayBuffer()
			: file
	if (run !== trainingRun) return
	let t = new Train()
	let intervalId = 0
	let readProgress: () => void
	t.addEventListener('message', (m) => {
		let msg = m.data as ProgressMessage
		if (msg.tag === 'Start') {
			if (run !== trainingRun) return
			setParameters('')
			setItemsProcessed(0)
			setItemsTotal(0)
			readProgress = () => {
				if (run !== trainingRun) return
				let { itemsProcessed, itemsTotal } = getProgress(
					msg.buffer,
					msg.pointer,
				)
				setItemsProcessed(itemsProcessed)
				setItemsTotal(itemsTotal)
			}
			intervalId = window.setInterval(readProgress, 100)
		} else if (msg.tag === 'Stop') {
			clearInterval(intervalId)
			try {
				if (run !== trainingRun) return
				readProgress()
				if (msg.parameters) setParameters(msg.parameters.toString())
			} finally {
				t.postMessage('Release')
			}
		}
	})
	t.postMessage(
		{ data, version } satisfies TrainingRequest,
		data instanceof ArrayBuffer ? [data] : [],
	)
}

export default App

// https://stackoverflow.com/a/65666402
export function throwExp(error: unknown): never {
	if (typeof error === 'string') {
		throw new Error(error)
	}
	throw error
}
