import { Router } from 'itty-router';
import { json } from 'itty-router-extras';

import { createCors } from 'itty-cors';
import agent from './agent';
import OpenAI from 'openai';

const { preflight, corsify } = createCors({ origins: ['*'] });
const router = Router();

router.all('*', preflight);

router.post('/chat/completions', async (request) => {
	const headers = request.headers;
	const { model, messages, tools } = await request.json();
	const authorization = headers.get('authorization');

	if (!authorization) {
		return new Response('Unauthorized.', { status: 401 });
	}

	const apiKey = authorization.replace('Bearer ', '');
	const openai = new OpenAI({
		apiKey,
		baseURL: 'https://api.groq.com/openai/v1',
	});

	try {
		const selectedTools = await agent.think({
			apiKey,
			tools,
			messages,
		});

		if (selectedTools) {
			return json(selectedTools);
		} else {
			if (messages[messages.length - 1].role === 'tool') {
				const content =
					`The tool's result after functions are called is\n\n` +
					`"""\n${msg.content}\n"""\n\n` +
					`Use the result to answer the user's last question`;

				const fixedMessages = messages.map((msg) => {
					if (msg.role === 'tool') {
						return {
							role: 'system',
							content,
						};
					} else {
						return msg;
					}
				});

				const chatCompletion = await openai.chat.completions.create({
					model,
					messages: fixedMessages,
				});

				return json(chatCompletion);
			} else {
				const chatCompletion = await openai.chat.completions.create({
					model,
					messages,
				});

				return json(chatCompletion);
			}
		}
	} catch (e) {
		console.error(e);
		return new Response(e);
	}
});

router.all('*', () => new Response('Not Found.', { status: 404 }));

export default { apiRouter: router, corsify: corsify };
