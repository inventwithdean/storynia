#include "sd_api.h"
#include "stable-diffusion.h"
#include <iostream>
#include <vector>

sd_ctx_t *sd_init(SDInitParams init_params)
{
    sd_ctx_params_t sd_ctx_params = {
        nullptr,
        init_params.clip_l_path,
        nullptr,
        nullptr,
        init_params.t5xxl_path,
        init_params.diffusion_model_path,
        nullptr,
        init_params.vae_path,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        false, // vae_decode_only is false, we need img2img as well
        false,
        12,            // Use 6 threads
        SD_TYPE_COUNT, // Auto-detect weight type from model
        CUDA_RNG,
        false,
        init_params.clip_on_cpu, // Use the value from Rust
        false,
        init_params.vae_on_cpu, // Use the value from Rust
        false,
        false,
        false,
        true,
        false,
        1,
        INFINITY, // Use default
    };

    printf("Attempting to initialize context with the following paths:\n");
    printf("  Diffusion Model: %s\n", sd_ctx_params.diffusion_model_path);
    printf("  Clip-L: %s\n", sd_ctx_params.clip_l_path);
    printf("  T5XXL: %s\n", sd_ctx_params.t5xxl_path);
    printf("  VAE: %s\n", sd_ctx_params.vae_path);

    sd_ctx_t *ctx = new_sd_ctx(&sd_ctx_params);

    if (ctx == NULL)
    {
        fprintf(stderr, "API Error: new_sd_ctx() failed to initialize context.\n");
    }

    return ctx;
}

SDImageData sd_generate_image(sd_ctx_t *sd_ctx, SDGenerationParams params)
{
    sd_image_t init_image = {(uint32_t)params.width, (uint32_t)params.height, 3, NULL};
    sd_image_t end_image = {(uint32_t)params.width, (uint32_t)params.height, 3, NULL};
    sd_image_t control_image = {(uint32_t)params.width, (uint32_t)params.height, 3, NULL};
    sd_image_t mask_image = {(uint32_t)params.width, (uint32_t)params.height, 1, NULL};
    sd_sample_params_t sample_params;
    sd_sample_params_init(&sample_params);
    std::vector<int> skip_layers = {7, 8, 9};
    sample_params.guidance.slg.layers = skip_layers.data();
    sample_params.guidance.slg.layer_count = skip_layers.size();
    sample_params.guidance.txt_cfg = params.cfg_scale;
    sample_params.sample_method = EULER;
    sd_tiling_params_t vae_tiling_params = {false, 0, 0, 0.5f, 0.0f, 0.0f};
    std::vector<sd_image_t> ref_images;
    std::vector<sd_image_t> pmid_images;

    sd_img_gen_params_t img_gen_params = {
        params.prompt,
        "",
        -1,
        init_image,
        ref_images.data(),
        (int)ref_images.size(),
        false,
        mask_image,
        params.width,
        params.height,
        sample_params,
        0.75f,
        42,
        1,
        control_image,
        0.9f,
        {
            pmid_images.data(),
            (int)pmid_images.size(),
            "",
            20.f,
        }, // pm_params
        vae_tiling_params,
    };

    sd_image_t *results;
    results = generate_image(sd_ctx, &img_gen_params);
    if (results == NULL)
    {
        fprintf(stderr, "API Error: generate_image() failed to return results.\n");
        return {0, 0, 0, NULL};
    }

    sd_image_t generated_image = results[0];
    uint32_t w = generated_image.width;
    uint32_t h = generated_image.height;
    uint32_t c = generated_image.channel;
    size_t size = (size_t)w * h * c;
    uint8_t *new_data = (uint8_t *)malloc(size);
    if (new_data == NULL)
    {
        fprintf(stderr, "API Error: Failed to allocate memory for final image buffer.\n");
        // Clean up the library's memory before returning.
        free(generated_image.data);
        free(results);
        return {0, 0, 0, NULL};
    }
    memcpy(new_data, generated_image.data, size);
    free(generated_image.data);
    free(results);
    SDImageData final_image = {
        w,
        h,
        c,
        new_data};
    return final_image;
}

SDImageData sd_edit_image(sd_ctx_t *sd_ctx, SDGenerationParams params, const SDImageData *ref_images_ptr, int num_ref_images)
{
    sd_image_t init_image = {(uint32_t)params.width, (uint32_t)params.height, 3, NULL};
    sd_image_t end_image = {(uint32_t)params.width, (uint32_t)params.height, 3, NULL};
    sd_image_t control_image = {(uint32_t)params.width, (uint32_t)params.height, 3, NULL};
    sd_image_t mask_image = {(uint32_t)params.width, (uint32_t)params.height, 1, NULL};

    sd_sample_params_t sample_params;
    sd_sample_params_init(&sample_params);
    std::vector<int> skip_layers = {7, 8, 9};
    sample_params.guidance.slg.layers = skip_layers.data();
    sample_params.guidance.slg.layer_count = skip_layers.size();
    sample_params.guidance.txt_cfg = params.cfg_scale;
    sample_params.sample_method = EULER;

    sd_tiling_params_t vae_tiling_params = {false, 0, 0, 0.5f, 0.0f, 0.0f};
    std::vector<sd_image_t> ref_images;
    std::vector<sd_image_t> pmid_images;

    for (int i = 0; i < num_ref_images; ++i)
    {
        const SDImageData &current_ref = ref_images_ptr[i];
        printf("[DEBUG C++] Received ref_image with: width=%u, height=%u, channel=%u\n",
               current_ref.width, current_ref.height, current_ref.channel);
        size_t input_size = (size_t)current_ref.width * current_ref.height * current_ref.channel;
        uint8_t *input_copy_data = (uint8_t *)malloc(input_size);
        if (input_copy_data == NULL)
        {
            fprintf(stderr, "API Error: Failed to allocate memory for input image copy.\n");
            for (auto &img : ref_images)
            {
                free(img.data);
            }
            return {0, 0, 0, NULL};
        }
        memcpy(input_copy_data, current_ref.data, input_size);

        ref_images.push_back({(uint32_t)current_ref.width,
                              (uint32_t)current_ref.height,
                              3,
                              input_copy_data});
    }

    sd_img_gen_params_t img_gen_params = {
        params.prompt,
        "",
        -1,
        init_image,
        ref_images.data(),
        (int)ref_images.size(),
        false,
        mask_image,
        params.width,
        params.height,
        sample_params,
        0.75f,
        42,
        1,
        control_image,
        0.9f,
        {
            pmid_images.data(),
            (int)pmid_images.size(),
            "",
            20.f,
        }, // pm_params
        vae_tiling_params,
    };

    sd_image_t *results;
    results = generate_image(sd_ctx, &img_gen_params);
    for (auto &img : ref_images)
    {
        free(img.data);
    }
    if (results == NULL)
    {
        fprintf(stderr, "API Error: generate_image() failed to return results.\n");
        return {0, 0, 0, NULL};
    }

    sd_image_t generated_image = results[0];
    uint32_t w = generated_image.width;
    uint32_t h = generated_image.height;
    uint32_t c = generated_image.channel;
    size_t size = (size_t)w * h * c;
    uint8_t *new_data = (uint8_t *)malloc(size);
    if (new_data == NULL)
    {
        fprintf(stderr, "API Error: Failed to allocate memory for final image buffer.\n");
        // Clean up the library's memory before returning.
        free(generated_image.data);
        free(results);
        return {0, 0, 0, NULL};
    }
    memcpy(new_data, generated_image.data, size);
    free(generated_image.data);
    free(results);
    SDImageData final_image = {
        w,
        h,
        c,
        new_data};
    return final_image;
}

void sd_free_image_data(SDImageData img)
{
    free(img.data);
}

void sd_free_context(sd_ctx_t *ctx)
{
    free_sd_ctx(ctx);
}