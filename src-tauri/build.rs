fn main() {
    // Project's root directory.
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();

    println!("cargo:rustc-link-search=native={}/lib", manifest_dir);

    println!("cargo:rustc-link-lib=static=sd_api");
    tauri_build::build()
}
