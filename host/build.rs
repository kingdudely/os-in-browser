fn main() {
    if cfg!(target_os = "linux") {
        println!("cargo:rustc-link-lib=dylib=glib-2.0");
        println!("cargo:rustc-link-lib=dylib=gobject-2.0");
        println!("cargo:rustc-link-lib=dylib=gio-2.0");
    }
}