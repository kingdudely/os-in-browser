USER_DATA_DIR="${GITHUB_WORKSPACE}/chrome-user-data"
EXTENSION_PATH="${GITHUB_WORKSPACE}/peer"
MANIFEST_DIR="${USER_DATA_DIR}/NativeMessagingHosts"
EXTENSION_ID="IDK BROOO"

case "${RUNNER_OS}" in
    Windows)
        CHROME_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe"
        HOST_PATH="$GITHUB_WORKSPACE/host/dist/host.exe"
        ;;

    macOS)
        CHROME_PATH="/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome"
        HOST_PATH="$GITHUB_WORKSPACE/host/dist/host"
        ;;

    Linux)
        CHROME_PATH="google-chrome"
        HOST_PATH="$GITHUB_WORKSPACE/host/dist/host"
        ;;

    *)
        echo "::error::Unsupported OS encountered: ${RUNNER_OS}"
        exit 1
        ;;
esac

mkdir -p "$MANIFEST_DIR"
cat <<EOF > "$MANIFEST_DIR/host.json"
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