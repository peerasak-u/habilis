import router from './router';

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname.startsWith('/chat/')) {
			return router.apiRouter
				.handle(request)
				.catch((err) => error(500, err.stack))
				.then(router.corsify);
		}

		return new Response(
			`Try making requests to:
      <ul>
      <li><code><a href="/redirect?redirectUrl=https://peerasak.com/">/redirect?redirectUrl=https://peerasak.com/</a></code>,</li>
      <li><code><a href="/proxy?modify&proxyUrl=https://example.com/">/proxy?modify&proxyUrl=https://example.com/</a></code>, or</li>`,
			{ headers: { 'Content-Type': 'text/html' } }
		);
	},
};
