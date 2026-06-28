chrome.offscreen.createDocument({
	url: 'offscreen.html',
	reasons: ['DOM_PARSER'],
	justification: 'persistent offscreen doc'
}).catch(() => {});