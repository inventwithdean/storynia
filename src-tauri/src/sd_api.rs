use std::ffi::{c_float, CString};
use std::os::raw::c_char;
use std::path::Path;
use std::sync::Mutex;
use std::{fs, slice};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[repr(C)]
pub struct SdCtxT {
    _private: [u8; 0],
}

pub struct SDContext(pub *mut SdCtxT);
unsafe impl Send for SDContext {}
unsafe impl Sync for SDContext {}

impl Drop for SDContext {
    fn drop(&mut self) {
        unsafe {
            sd_free_context(self.0);
            println!("SDContext destroyed!")
        }
    }
}
pub struct FluxState(pub Mutex<Option<SDContext>>);

#[repr(C)]
#[derive(Debug, Clone)]
pub struct SDInitParams {
    pub diffusion_model_path: *const c_char,
    pub clip_l_path: *const c_char,
    pub t5xxl_path: *const c_char,
    pub vae_path: *const c_char,
    pub clip_on_cpu: bool,
    pub vae_on_cpu: bool,
}

#[repr(C)]
#[derive(Debug, Clone)]
pub struct SDGenerationParams {
    pub prompt: *const c_char,
    pub width: u32,
    pub height: u32,
    pub sample_steps: u32,
    pub cfg_scale: c_float,
}

#[repr(C)]
#[derive(Debug, Clone)]
pub struct SDImageData {
    pub width: u32,
    pub height: u32,
    pub channel: u32,
    pub data: *mut u8,
}

// Implemented in sd_api.lib
unsafe extern "C" {
    pub unsafe fn sd_init(params: SDInitParams) -> *mut SdCtxT;
    pub unsafe fn sd_generate_image(ctx: *mut SdCtxT, params: SDGenerationParams) -> SDImageData;
    pub unsafe fn sd_edit_image(
        ctx: *mut SdCtxT,
        params: SDGenerationParams,
        ref_images_ptr: *const SDImageData,
        num_ref_images: u32,
    ) -> SDImageData;
    pub unsafe fn sd_free_image_data(img: SDImageData);
    pub unsafe fn sd_free_context(ctx: *mut SdCtxT);
}

#[derive(Clone, Serialize)]
struct GenerationResult {
    file_path: String,
    prompt: String,
}

/*
Calls the C++ Engine to generate a image with the prompt and saves at output_path
*/
#[tauri::command]
pub fn generate_image(prompt: String, output_path: String, app_handle: AppHandle) {
    if let Some(parent_dir) = Path::new(&output_path).parent() {
        // Create the parent directory and all its ancestors if they don't exist.
        fs::create_dir_all(parent_dir)
            .map_err(|e| e.to_string())
            .unwrap();
    }
    std::thread::spawn(move || {
        let state = app_handle.state::<FluxState>();
        let guard = state.0.lock().unwrap();
        if let Some(ctx) = &*guard {
            let prompt_c = CString::new(prompt.as_str()).expect("CString::new failed");
            let gen_params = SDGenerationParams {
                prompt: prompt_c.as_ptr(),
                width: 512,
                height: 512,
                sample_steps: 20,
                cfg_scale: 1.0,
            };
            let img_data;
            unsafe {
                img_data = sd_generate_image(ctx.0, gen_params);
            }
            if img_data.data.is_null() {
                eprintln!("Error: Failed to generate image.");
            } else {
                println!(
                    "Image Generated successfuly: {}x{}x{}",
                    img_data.width, img_data.height, img_data.channel
                );
                unsafe {
                    let size = (img_data.width * img_data.height * img_data.channel) as usize;
                    let img_slice = slice::from_raw_parts(img_data.data, size);
                    match image::ImageBuffer::<image::Rgb<u8>, _>::from_raw(
                        img_data.width,
                        img_data.height,
                        img_slice,
                    ) {
                        Some(buffer) => {
                            if let Err(e) = buffer.save(&output_path) {
                                eprintln!("Error saving image: {}", e);
                            } else {
                                println!("Image saved successfully!");
                                let payload = GenerationResult {
                                    file_path: output_path,
                                    prompt: prompt,
                                };
                                let _ = app_handle.emit("IMAGE_GENERATED", payload);
                            }
                        }
                        None => {
                            eprintln!("Could not create image buffer");
                        }
                    }
                    sd_free_image_data(img_data);
                }
            }
        }
    });
}

/*
Calls the C++ Engine to edit the given reference images with prompt and saves at output_path
*/
#[tauri::command]
pub fn edit_image(
    prompt: String,
    output_path: String,
    ref_image_paths: Vec<String>,
    app_handle: AppHandle,
) {
    if let Some(parent_dir) = Path::new(&output_path).parent() {
        // Create the parent directory and all its ancestors if they don't exist.
        fs::create_dir_all(parent_dir)
            .map_err(|e| e.to_string())
            .unwrap();
    }
    std::thread::spawn(move || {
        let state = app_handle.state::<FluxState>();
        let guard = state.0.lock().unwrap();
        if let Some(ctx) = &*guard {
            let prompt_c = CString::new(prompt.as_str()).expect("CString::new failed");
            let gen_params = SDGenerationParams {
                prompt: prompt_c.as_ptr(),
                width: 512,
                height: 512,
                sample_steps: 20,
                cfg_scale: 1.0,
            };
            // let ref_image_paths = vec!["cat"];

            // This first vector OWNS the image data. It must live until the FFI call is over.
            let mut loaded_images = Vec::new();
            for path in ref_image_paths {
                println!("Loading reference image from: {}", path);
                let dynamic_image = image::open(path).expect("Failed to open reference image");
                loaded_images.push(dynamic_image.to_rgb8());
            }
            let mut ref_images_ffi: Vec<SDImageData> = Vec::new();

            for rgb_image in &mut loaded_images {
                ref_images_ffi.push(SDImageData {
                    width: rgb_image.width(),
                    height: rgb_image.height(),
                    channel: 3,
                    data: rgb_image.as_mut_ptr(),
                });
            }
            let img_data;
            unsafe {
                img_data = sd_edit_image(
                    ctx.0,
                    gen_params,
                    ref_images_ffi.as_ptr(), // Pass pointer to the first element
                    ref_images_ffi.len().try_into().unwrap(), // Pass the number of elements
                );
            }
            if img_data.data.is_null() {
                eprintln!("Error: Failed to generate image.")
            } else {
                println!(
                    "Image Generated successfuly: {}x{}x{}",
                    img_data.width, img_data.height, img_data.channel
                );
                unsafe {
                    let size = (img_data.width * img_data.height * img_data.channel) as usize;
                    let img_slice = slice::from_raw_parts(img_data.data, size);
                    match image::ImageBuffer::<image::Rgb<u8>, _>::from_raw(
                        img_data.width,
                        img_data.height,
                        img_slice,
                    ) {
                        Some(buffer) => {
                            if let Err(e) = buffer.save(&output_path) {
                                eprintln!("Error saving image: {}", e);
                            } else {
                                println!("Image saved successfully!");
                                let payload = GenerationResult {
                                    file_path: output_path,
                                    prompt: prompt,
                                };
                                let _ = app_handle.emit("IMAGE_GENERATED", payload);
                            }
                        }
                        None => {
                            eprintln!("Could not create image buffer");
                        }
                    }
                    sd_free_image_data(img_data);
                }
            }
        }
    });
}

/*
Initializes SDContext and updates FluxContext State via appHandle
*/
pub fn initialize_flux_kontext(app_handle: AppHandle) -> Result<(), String> {
    // let diffusion_model_path =
    //     CString::new("D:/Rust/flux-ffi/models/flux1-kontext-dev-Q3_K_S.gguf")
    //         .expect("CString::new failed");
    // let clip_l_path =
    //     CString::new("D:/Rust/flux-ffi/models/clip_l.safetensors").expect("CString::new failed");
    // let t5xxl_path = CString::new("D:/Rust/flux-ffi/models/t5xxl_fp8_e4m3fn.safetensors")
    //     .expect("CString::new failed");
    // let vae_path =
    //     CString::new("D:/Rust/flux-ffi/models/ae.safetensors").expect("CString::new failed");

     let diffusion_model_path =
        CString::new("./flux-kontext.gguf")
            .expect("CString::new failed");
    let clip_l_path =
        CString::new("./clip_l.safetensors").expect("CString::new failed");
    let t5xxl_path = CString::new("./t5xxl_fp8_e4m3fn.safetensors")
        .expect("CString::new failed");
    let vae_path =
        CString::new("./ae.safetensors").expect("CString::new failed");

    let params = SDInitParams {
        diffusion_model_path: diffusion_model_path.as_ptr(),
        clip_l_path: clip_l_path.as_ptr(),
        t5xxl_path: t5xxl_path.as_ptr(),
        vae_path: vae_path.as_ptr(),
        clip_on_cpu: true,
        vae_on_cpu: false,
    };

    println!("Initializing Stable Diffusion context...");

    let ctx: *mut SdCtxT;
    unsafe {
        ctx = sd_init(params);
    }
    if ctx.is_null() {
        eprintln!("Error: Failed to initialize Stable Diffusion context.");
        return Err("Error: Failed to initialize Stable Diffusion context.".to_string());
    }

    println!("Context initialized successfully! Pointer: {:?}", ctx);
    let state = app_handle.state::<FluxState>();
    *state.0.lock().unwrap() = Some(SDContext(ctx));

    Ok(())
}
