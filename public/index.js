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
    return;
}

import Client from "./client.js";

const oauthDialog = document.getElementById("oauth-dialog");
oauthDialog.showModal();
oauthDialog.addEventListener('cancel', (event) => event.preventDefault());

const screenshare = document.getElementById("screenshare");
const client = new Client(screenshare);
async function onlogin(access_token) {
    oauthDialog.close();

	await client.getLocalAddress();
	await client.connectToRemoteAddress(responseidk);
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