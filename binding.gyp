{
  "targets": [
    {
      "target_name": "native-apis",

      "sources": [
        "src/addon.cpp"
      ],

      "conditions": [
        [
          "OS=='win'",
          {
            "sources": [
              "src/windows/src/mouse.cpp",
              "src/windows/src/keyboard.cpp",
              "src/windows/src/clipboard.cpp"
            ],
            "libraries": [
              "user32.lib"
            ]
          }
        ],
        [
          "OS=='linux'",
          {
            "sources": [
              "src/linux/src/mouse.cpp",
              "src/linux/src/keyboard.cpp",
              "src/linux/src/clipboard.cpp"
            ],
            "libraries": [
              "-lX11",
              "-lXtst",
              "-lXfixes"
            ]
          }
        ],
        [
          "OS=='mac'",
          {
            "sources": [
              "src/macos/src/mouse.cpp",
              "src/macos/src/keyboard.cpp",
              "src/macos/src/clipboard.mm"
            ],
            "link_settings": {
              "libraries": [
                "-framework AppKit",
                "-framework Carbon",
                "-framework CoreGraphics",
                "-framework IOKit"
              ]
            },
            "xcode_settings": {
              "OTHER_CFLAGS": [],
              "OTHER_LDFLAGS": []
            }
          }
        ]
      ],

      "include_dirs": [
        "src",
        "<!@(node -p \"require('node-addon-api').include\")"
      ],

      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],

      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ]
    }
  ]
}