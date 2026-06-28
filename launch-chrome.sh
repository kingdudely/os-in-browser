USER_DATA_DIR="${GITHUB_WORKSPACE}/chrome-user-data"
EXTENSION_PATH="${GITHUB_WORKSPACE}/peer"
NATIVE_MESSAGING_HOSTS_DIR="${USER_DATA_DIR}/NativeMessagingHosts"
EXTENSION_ID="IDK BROOO"
HOST_PATH="$GITHUB_WORKSPACE/host.py"

case "${RUNNER_OS}" in
    Windows)
        CHROME_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe"
        ;;

    macOS)
        CHROME_PATH="/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome"
        ;;

    Linux)
        CHROME_PATH="/usr/bin/google-chrome"
        ;;

    *)
        echo "::error::Unsupported OS encountered: ${RUNNER_OS}"
        exit 1
        ;;
esac

mkdir -p "$NATIVE_MESSAGING_HOSTS_DIR"
cat <<EOF > "$NATIVE_MESSAGING_HOSTS_DIR/bash.json"
{
    "name": "host",
    "description": "os-in-browser",
    "path": "${HOST_PATH}",
    "type": "stdio",
    "allowed_origins": [
        "chrome-extension://${EXTENSION_ID}/"
    ]
}
EOF

# --no-sandbox --disable-gpu --allow-http-screen-capture --unsafely-treat-insecure-origin-as-secure="http://localhost:${PORT}" --start-maximized
"$CHROME_PATH" \
    --headless=new \
    --user-data-dir="$USER_DATA_DIR" \
    --load-extension="$EXTENSION_PATH" \
    --use-fake-ui-for-media-stream \
    --auto-select-desktop-capture-source="Entire screen"