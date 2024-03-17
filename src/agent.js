import OpenAI from 'openai';
import utils from './utils';

const generateUniqueId = utils.generateUniqueId;
const parseCodeBlocks = utils.parseCodeBlocks;

const debugMode = false;
const baseURL = 'https://api.groq.com/openai/v1';
const model = 'mixtral-8x7b-32768';

const debugLog = debugMode ? console.log : (_) => {};

const systemPrompt = `You are an AI assistant with access to a set of tools. Each tool is a function that takes parameters and returns information to help answer the user's question.

Given the conversation history and the user's latest message, your task is to:

1. Determine if any tools are needed to answer the question
2. If tools are needed, identify which ones and extract the necessary parameter values from the user's message
3. Provide your reasoning and return a JSON response with the selected tools and their parameters, or an empty "tool_calls" list if no tools are required

The tools are provided as a JSON list, each with a name, description, and a JSON schema for its parameters.

System messages starting with 'SYSTEM MESSAGE' are instructions for you and should not be treated as user messages or responded to.

Your JSON response should follow this format:
\`\`\`json
{
   "tool_calls": [
       {
           "name": "function_name",
           "arguments": {
               "arg1": "value1",
               "arg2": "value2",
               ...
           }
       },
       ...
   ]
}
\`\`\`
Wrap the JSON response between \`\`\`json and \`\`\`.`;

const think = async ({ apiKey, tools, messages }) => {
	const openai = new OpenAI({
		apiKey,
		baseURL,
	});

	debugLog(messages);

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

	const content = `From history messages below:
		"""
        ${historyMessages}
        """
		
        and provided tools:
		\`\`\`
        ${JSON.stringify(tools)}
        \`\`\`

        Your task is to carefully think through each request, evaluate the necessary steps and tools required to fulfill it, and provide a well-justified response. When responding, format your answer as a JSON object, wrapped between "\`\`\`json" and "\`\`\`" tags.

        If no tools are needed or if the previous message was a <TOOL MESSAGE>, simply return a JSON object with the key "tool_calls" set to null, like this: \`{"tool_calls": null}\`
        `;

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
