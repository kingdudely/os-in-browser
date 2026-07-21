class ApiClient {
	constructor(baseApiHostname, headers) {
		this.headers = Object.fromEntries(new Headers(headers));
		this.baseApiHostname = baseApiHostname;
	}

	async request(method, path, body = null) {
		const headers = structuredClone(this.headers);

		if (Object.prototype.toString.call(body) === "[object Object]") {
			headers["Content-Type"] = "application/json";
			body = JSON.stringify(body);
		}

		const response = await fetch(`${this.baseApiHostname}${path}`, { headers, body, method });

		if (!response.ok) {
			throw new Error(`API returned status ${response.status} ${response.statusText}: ${await response.text().catch(() => "")}`);
		}

		const contentType = response.headers.get("Content-Type") || "";
		if (contentType.includes("application/json")) {
			return response.json();
		}

		return response;
	}

	get(path) {
		return this.request("GET", path);
	}

	post(path, body) {
		return this.request("POST", path, body);
	}

	put(path, body) {
		return this.request("PUT", path, body);
	}

	delete(path) {
		return this.request("DELETE", path);
	}
}