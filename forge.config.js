module.exports = {
    packagerConfig: {
        extendInfo: {
            NSAudioCaptureUsageDescription:
                "This app captures system audio for remote desktop."
        }
    },

    makers: [
        {
            name: "@electron-forge/maker-zip"
        }
    ],

    rebuildConfig: {
        ignoreModules: ["native-apis"]
    }
};