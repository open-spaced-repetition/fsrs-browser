import { UserConfig, defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import offMainThread from '@surma/rollup-plugin-off-main-thread'
// import devtools from 'solid-devtools/vite';

export default defineConfig(({ mode }: UserConfig) => {
	let plugins = [
		/* 
    Uncomment the following line to enable solid-devtools.
    For more info see https://github.com/thetarnav/solid-devtools/tree/main/packages/extension#readme
    */
		// devtools(),
		solidPlugin(),
		{
			// https://gist.github.com/mizchi/afcc5cf233c9e6943720fde4b4579a2b
			name: 'isolation',
			configureServer(server) {
				server.middlewares.use((_req, res, next) => {
					res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
					res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
					next()
				})
			},
		},
	]
	if (mode === 'production') {
		plugins.push(offMainThread())
	}
	return {
		plugins,
		server: {
			port: 3000,
			fs: {
				// Allow serving files from one level up to the project root
				allow: ['..'],
			},
		},
		build: {
			target: 'esnext',
		},
	}
})
