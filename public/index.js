window.addEventListener("error", (event) => {
	const errorMessage = event.message || "Unknown error occurred";
	window.alert(`Error:\n${errorMessage}`);
});

window.addEventListener("unhandledrejection", (event) => {
	const asyncErrorMessage = event.reason?.message || event.reason || "Unknown async error occurred";
	window.alert(`Async error:\n${asyncErrorMessage}`);
});

const code = new URLSearchParams(location.search).get("code");
if (code) {
	history.replaceState(history.state, document.title, location.pathname);
	const oauth = document.getElementById("oauth");
	oauth.code.value = code;
	oauth.requestSubmit(document.getElementById("download-access-token"));
	// return
}

import Client from "./client.js";
const sleep = (milliseconds) => await new Promise((resolve) => setTimeout(resolve, milliseconds));

const oauthDialog = document.getElementById("oauth-dialog");
oauthDialog.showModal();
oauthDialog.addEventListener('cancel', (event) => event.preventDefault());

const screenshare = document.getElementById("screenshare");
async function onlogin(access_token) {
	oauthDialog.close();

	const client = new Client(screenshare);
	const shareId = await client.getShareId();

	const owner = "kingdudely";
	const repo = "os-in-browser";
	const headers = {
		"Authorization": `token ${access_token}`,
		"Content-Type": "application/json"
	};

	const { default_branch } = await (await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })).json();

	await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/main.yml/dispatches`, {
		headers,
		"body": JSON.stringify({
			"ref": default_branch,
			"inputs": {
				"os": "windows-latest",
				"share-id": shareId
			}
		}),
		"method": "POST",
	});

	// clearTimeout
	const timeout = setTimeout(() => window.alert("Taking a little too long to load, maybe try refreshing?"), 30_000);
	let answerDownloadUrl;
	while (true) {
		const { artifacts } = await (await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/artifacts`, { headers })).json();
		answerDownloadUrl = artifacts?.find((artifact) => artifact.name === "answer.txt")?.archive_download_url;
		if (answerDownloadUrl) {
			clearTimeout(timeout);
			break;
		}

		await sleep(1000);
	}

	const answerShareId = await (await fetch(answerDownloadUrl, { headers })).text();
	await client.connectToShareId(answerShareId.trim());
}

document.getElementById("credential-file").addEventListener("change", async (event) => {
	const credentialFile = event.target.files[0];
	if (!credentialFile) return;

	const access_token = new URLSearchParams(await credentialFile.text()).get("access_token");
	if (!access_token) {
		alert("Invalid credential file");
		return;
	}

	onlogin(access_token);
});