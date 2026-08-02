{
  "targets": [
    {
      "target_name": "native-apis",
      "sources": ["src/shared/addon.cpp"],
      "conditions": [
        ["OS=='win'", {
          "sources": [
            "src/windows/mouse.cpp",
            "src/windows/keyboard.cpp",
            "src/windows/virtual_screen.cpp"
          ],
          "libraries": [
            "setupapi.lib",
            "cfgmgr32.lib",
            "advapi32.lib"
          ]
        }],
        ["OS=='linux'", {
          "sources": [
            "src/linux/uinput.cpp",
            "src/linux/mouse.cpp",
            "src/linux/keyboard.cpp",
            "src/linux/virtual_screen.cpp"
          ],
          "libraries": [
            "-lX11",
            "-lXrandr"
          ]
        }],
        ["OS=='mac'", {
          "sources": [
            "src/macos/mouse.cpp",
            "src/macos/keyboard.cpp",
            "src/macos/virtual_screen.mm"
          ],
          "link_settings": {
            "libraries": [
              "-framework Carbon",
              "-framework Foundation",
              "-framework CoreGraphics"
            ]
          },
          "xcode_settings": {
            "OTHER_CFLAGS": ["-ObjC++", "-fobjc-arc"],
            "OTHER_LDFLAGS": []
          }
        }]
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
    }
  ]
}
