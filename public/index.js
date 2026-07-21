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
import ApiClient from "./ApiClient.js";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const oauthDialog = document.getElementById("oauth-dialog");
oauthDialog.showModal();
oauthDialog.addEventListener('cancel', (event) => event.preventDefault());

const screenshare = document.getElementById("screenshare");

async function onlogin(accessToken) {
	oauthDialog.close();

	const GitHub = new ApiClient("https://api.github.com", {
		"Authorization": `token ${accessToken}`
	});
	const client = new Client(screenshare);
	const shareId = await client.getShareId();
	
	const repoEndpoint = `/repos/kingdudely/os-in-browser`

	const branch = (await GitHub.get(repoEndpoint)).default_branch;

	await GitHub.post(`${repoEndpoint}/actions/workflows/main.yml/dispatches`, {
		"ref": branch,
		"inputs": {
			"os": "windows-latest",
			"share-id": shareId
		}
	});

	// clearTimeout
	const timeout = setTimeout(() => window.alert("Taking a little too long to load, maybe try refreshing?"), 30_000);
	let answerDownloadUrl;
	while (true) {
		const { artifacts } = await GitHub.get(`${repoEndpoint}/actions/artifacts`);
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

	const accessToken = new URLSearchParams(await credentialFile.text()).get("accessToken");
	if (!accessToken) {
		alert("Invalid credential file");
		return;
	}

	onlogin(accessToken);
});