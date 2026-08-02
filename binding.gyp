{
  "targets": [
    {
      "target_name": "native-apis",
      "sources": ["native-apis/shared/addon.cpp"],
      "conditions": [
        ["OS=='win'", {
          "sources": [
            "native-apis/windows/mouse.cpp",
            "native-apis/windows/keyboard.cpp",
            "native-apis/windows/virtual_screen.cpp"
          ],
          "libraries": [
            "setupapi.lib",
            "cfgmgr32.lib",
            "advapi32.lib"
          ]
        }],
        ["OS=='linux'", {
          "sources": [
            "native-apis/linux/uinput.cpp",
            "native-apis/linux/mouse.cpp",
            "native-apis/linux/keyboard.cpp",
            "native-apis/linux/virtual_screen.cpp"
          ],
          "libraries": [
            "-lX11",
            "-lXrandr"
          ]
        }],
        ["OS=='mac'", {
          "sources": [
            "native-apis/macos/mouse.cpp",
            "native-apis/macos/keyboard.cpp",
            "native-apis/macos/virtual_screen.mm"
          ],
          "include_dirs": [
            "native-apis/macos/vendor/karabiner"
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
            "OTHER_CPLUSPLUSFLAGS": ["-std=c++17"],
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "13.0",
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
