import OpenAI from 'openai';
import utils from './utils';

const generateUniqueId = utils.generateUniqueId;
const parseCodeBlocks = utils.parseCodeBlocks;

const debugMode = true;
const baseURL = 'https://api.groq.com/openai/v1';
const model = 'mixtral-8x7b-32768';

const debugLog = debugMode ? console.log : (_) => {};

const think = async ({ apiKey, tools, messages }) => {
	const openai = new OpenAI({
		apiKey,
		baseURL,
	});

	const systemPrompt =
		"A history of conversations between an AI assistant and the user, plus the last user's message, is given to you. " +
		'In addition, you have access to a list of available tools. Each tool is a function that requires a set of parameters and, in response, returns information that the AI assistant needs to provide a proper answer.\n\n' +
		'The list of tools is a JSON list, with each tool having a name, a description to help you identify which tool might be needed, and "parameters," which is a JSON schema to explain what parameters the tool needs, and you have to extract their value from the user\'s last message.\n\n' +
		"Depending on the user's question, the AI assistant can either directly answer the user's question without using a tool, or it may need to first call one or multiple tools, wait for the answer, then aggregate all the answers and provide the final answer to the user's last questions.\n\n" +
		"Your job is to closely check the user's last message and the history of the conversation, then decide if the AI assistant needs to answer the question using any tools. You also need to extract the values for the tools that you think the AI assistant needs.\n\n" +
		'You should think step by step, provide your reasoning for your response, then add the JSON response at the end following the below schema:\n\n' +
		'{\n   "tool_calls" : [\n       {\n           "name": "function_name",\n           "arguments": {\n                   "arg1" : "value1", "arg2": "value2", ...\n           }\n       }, ....\n       ]\n    }\n\n' +
		'** If no tools are required, then return an empty list for "tool_calls". **\n\n' +
		'**Wrap the JSON response between ```json and ```**\n\n' +
		"** Whenever a message starts with 'SYSTEM MESSAGE', that is a guide and help information for you to generate your next response, do not consider them a message from the user, and do not reply to them at all. Just use the information and continue your conversation with the user.**\n";

	if (messages[messages.length - 1].role === 'tool') {
		debugLog('TOOL RESULT DETECTED');
		return null;
	}

	const historyMessages = messages
		.filter((msg) => msg.content !== null)
		.map((msg) => {
			return `{{${msg.role.toUpperCase()} MESSAGE}}: ${msg.content}`;
		})
		.join('\n');

	debugLog('================ 👀 history message ================');
	debugLog(historyMessages);

	const content =
		`From history messages below:\n\n` +
		`"""\n${historyMessages}\n"""\n\n` +
		` and provided tools:\n\n` +
		`\`\`\`\n${JSON.stringify(tools)}\n\`\`\`\n\n` +
		`Think step by step and justify your response, then generate the JSON response wrapped between "\`\`\`json" and "\`\`\`". ` +
		`If no need to any tools or the last message is the <TOOL MESSAGE> you must return json of \`\`\`{ "tool_calls": null }\`\`\`"`;

	const prompted = [
		{
			role: 'system',
			content: systemPrompt,
		},
		{
			role: 'user',
			content,
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
		let tool = selectedTools.tool_calls[0];
		tool.arguments = JSON.stringify(tool.arguments);
		const unixTimestamp = Math.floor(Date.now() / 1000);

		const result = {
			id: generateUniqueId(),
			object: 'chat.completion',
			created: unixTimestamp,
			model,
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
								function: tool,
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

export default { think };
