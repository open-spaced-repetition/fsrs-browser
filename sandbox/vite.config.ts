import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
// import devtools from 'solid-devtools/vite';

export default defineConfig(() => {
	let plugins = [
		/* 
    Uncomment the following line to enable solid-devtools.
    For more info see https://github.com/thetarnav/solid-devtools/tree/main/packages/extension#readme
    */
		// devtools(),
		solidPlugin(),
	]
	return {
		plugins,
		server: {
			port: 3000,
			fs: {
				// Allow serving files from one level up to the project root
				allow: ['..'],
			},
			headers: {
				'Cross-Origin-Opener-Policy': 'same-origin',
				'Cross-Origin-Embedder-Policy': 'require-corp',
			},
		},
		build: {
			target: 'esnext',
		},
		optimizeDeps: {
			// If you use Vite and install `fsrs-browser` from npm, you'll need the below `exclude` for reasons given here https://github.com/vitejs/vite/issues/8427
			// since `fsrs-browser` uses wasm-pack. Without it, you'll run into the below error messages:
			//     `WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:
			//     TypeError: Failed to execute 'compile' on 'WebAssembly': Incorrect response MIME type. Expected 'application/wasm'.
			//     CompileError: WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 64 6f @+0
			exclude: ['fsrs-browser'],
		},
	}
})
