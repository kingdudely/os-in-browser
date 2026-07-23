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

import Client from "./Client.js";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const oauthDialog = document.getElementById("oauth-dialog");
oauthDialog.showModal();
oauthDialog.addEventListener('cancel', (event) => event.preventDefault());

const screenshare = document.getElementById("screenshare");
async function onlogin(accessToken) {
	oauthDialog.close();

	const client = new Client(screenshare);
	const shareId = await client.getShareId();

	const repoEndpoint = "https://api.github.com/repos/kingdudely/os-in-browser";
	const headers = {
		"Authorization": `token ${accessToken}`,
		"Content-Type": "application/json"
	};

	const { default_branch } = await (await fetch(repoEndpoint, { headers })).json();
	const { workflow_run_id } = await (await fetch(`${repoEndpoint}/actions/workflows/main.yml/dispatches`, {
		headers,
		"body": JSON.stringify({
			"ref": default_branch,
			"return_run_details": true,
			"inputs": {
				"os": "windows-latest",
				"share-id": shareId
			}
		}),
		"method": "POST",
	})).json();

	// clearTimeout
	const timeout = setTimeout(() => window.alert("Taking a little too long to connect, maybe try refreshing?"), 67_6767);
	let answerDownloadUrl;
	while (true) {
		const { artifacts } = await (await fetch(`${repoEndpoint}/actions/runs/${workflow_run_id}/artifacts`, { headers })).json();
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

	const accessToken = new URLSearchParams(await credentialFile.text()).get("access_token");
	if (!accessToken) {
		alert("Invalid credential file");
		return;
	}

	onlogin(accessToken);
});