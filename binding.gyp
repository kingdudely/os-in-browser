{
  "targets": [
    {
      "target_name": "native-apis",
      "sources": [],
      "conditions": [
        ["OS=='win'", {
          "sources": ["native-apis/windows.cc"],
          "libraries": [
            "setupapi.lib",
            "cfgmgr32.lib",
            "advapi32.lib"
          ]
        }],
        ["OS=='linux'", {
          "sources": ["native-apis/ubuntu.cc"],
          "libraries": [
            "-lX11",
            "-lXrandr"
          ]
        }],
        ["OS=='mac'", {
          "sources": ["native-apis/macos.mm"],
          "link_settings": {
            "libraries": [
              "-framework Carbon",
              "-framework Foundation",
              "-framework CoreGraphics"
            ]
          },
          "xcode_settings": {
            "OTHER_CFLAGS": ["-ObjC++", "-fobjc-arc"]
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