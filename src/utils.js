const generateUniqueId = () => {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		var r = (Math.random() * 16) | 0,
			v = c == 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
};

const parseCodeBlocks = (markdownString) => {
	const codeBlockRegex = /```(?:json)?\n([\s\S]*?)```/g;
	const match = codeBlockRegex.exec(markdownString);

	if (match && match[1]) {
		return match[1].trim();
	}

	return null;
};

export default { generateUniqueId, parseCodeBlocks };
