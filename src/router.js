import { Router } from 'itty-router';
import { json } from 'itty-router-extras';

import { createCors } from 'itty-cors';
import utils from './utils';
import OpenAI from 'openai';

const { preflight, corsify } = createCors({ origins: ['*'] });
const router = Router();
const generateUniqueId = utils.generateUniqueId;
const parseCodeBlocks = utils.parseCodeBlocks;

router.all('*', preflight);

const funky = async ({ apiKey, tools, messages }) => {
	const openai = new OpenAI({
		apiKey,
		baseURL: 'https://api.groq.com/openai/v1',
	});

	const model = 'mixtral-8x7b-32768';
	const systemPrompt =
		'A history of conversations between an AI assistant and the user, plus the last user\'s message, is given to you. \n\nIn addition, you have access to a list of available tools. Each tool is a function that requires a set of parameters and, in response, returns information that the AI assistant needs to provide a proper answer.\n\nThe list of tools is a JSON list, with each tool having a name, a description to help you identify which tool might be needed, and "parameters," which is a JSON schema to explain what parameters the tool needs, and you have to extract their value from the user\'s last message.\n\nDepending on the user\'s question, the AI assistant can either directly answer the user\'s question without using a tool, or it may need to first call one or multiple tools, wait for the answer, then aggregate all the answers and provide the final answer to the user\'s last questions.\n\nYour job is to closely check the user\'s last message and the history of the conversation, then decide if the AI assistant needs to answer the question using any tools. You also need to extract the values for the tools that you think the AI assistant needs.\n\nYou should think step by step, provide your reasoning for your response, then add the JSON response at the end following the below schema:\n\n{\n"tool_calls" : [\n   { \n       "name": "function_name",\n       "arguments": {\n               "arg1" : "value1", "arg2": "value2", ...\n       }\n   }, ....\n]\n}\n\n** If no tools are required, then return an empty list for "tool_calls". **\n\n**Wrap the JSON response between ```json and ```**\n\n** Whenever a message starts with \'SYSTEM MESSAGE\', that is a guide and help information for you to generate your next response, do not consider them a message from the user, and do not reply to them at all. Just use the information and continue your conversation with the user.**\n';

	if (messages[messages.length - 1].role === 'tool') {
		console.log('TOOL RESULT DETECTED');
		return null;
	}

	const historyMessages = messages
		.map((msg) => {
			return `<${msg.role.toUpperCase()} MESSAGE>: ${msg.content}`;
		})
		.join('\n');

	console.log('================ 👀 history message ================');
	console.log(historyMessages);

	const prompted = [
		{
			role: 'system',
			content: systemPrompt,
		},
		{
			role: 'user',
			content: `From history messages below:\n\n"""\n${historyMessages}\n"""\n\n and provided tools:\n\n\`\`\`\n${JSON.stringify(
				tools
			)}\n\`\`\`\n\nThink step by step and justify your response, then generate the JSON response wrapped between "\`\`\`json" and "\`\`\`". If no need to any tools or the last message is the <TOOL MESSAGE> you must return json of \`\`\`{ "tool_calls": null }\`\`\`"`,
		},
	];

	const toolSelection = await openai.chat.completions.create({
		model,
		messages: prompted,
		temperature: 0.3,
	});

	const toolSelectionMessage = toolSelection.choices[0].message.content;
	const cleanedMessage = parseCodeBlocks(toolSelectionMessage);

	const selectedTools = JSON.parse(cleanedMessage);

	if (selectedTools.tool_calls !== null) {
		let funcky = selectedTools.tool_calls[0];
		funcky.arguments = JSON.stringify(funcky.arguments);
		const unixTimestamp = Math.floor(Date.now() / 1000);

		const result = {
			id: generateUniqueId(),
			object: 'chat.completion',
			created: unixTimestamp,
			model: 'mixtral-8x7b-32768',
			prompt: [],
			choices: [
				{
					finish_reason: 'tool_calls',
					logprobs: null,
					index: 0,
					message: {
						role: 'assistant',
						content: null,
						tool_calls: [
							{
								id: `call_${generateUniqueId()}`,
								type: 'function',
								function: funcky,
							},
						],
					},
				},
			],
			usage: {
				prompt_tokens: 100,
				completion_tokens: 100,
				total_tokens: 200,
			},
		};

		return result;
	} else {
		return null;
	}
};

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
		const selectedTools = await funky({
			apiKey,
			tools,
			messages,
		});

		console.log({ selectedTools });

		if (selectedTools) {
			console.log('USE TOOL');
			return json(selectedTools);
		} else {
			console.log('PASS THROUGH');
			if (messages[messages.length - 1].role === 'tool') {
				const fixedMessages = messages.map((msg) => {
					if (msg.role === 'tool') {
						return {
							role: 'system',
							content: `The tool's result after functions are called is\n\n"""\n${msg.content}\n"""\n\n. Use the result to answer the user's last question`,
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
