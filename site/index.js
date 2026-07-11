function onlogin(access_token) {

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

const code = new URLSearchParams(location.search).get("code");
if (code) {
	history.replaceState(history.state, document.title, location.pathname);
	const oauth = document.getElementById("oauth");
	oauth.code.value = code;
	oauth.requestSubmit(document.getElementById("download-access-token"));
}