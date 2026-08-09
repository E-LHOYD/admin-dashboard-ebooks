import adapter from '@sveltejs/adapter-auto';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) =>
			filename.split(/[/\\]/).includes('node_modules') ? undefined : true
	},

	kit: {
		adapter: adapter(),
		prerender: {
			handleHttpError: 'warn'
		}
	}
};

export default config;