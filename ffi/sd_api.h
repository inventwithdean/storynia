#include <stdint.h>
#include <stdbool.h>

extern "C"
{

    typedef struct sd_ctx_t sd_ctx_t;

    typedef struct
    {
        uint32_t width;
        uint32_t height;
        uint32_t channel;
        uint8_t *data;
    } SDImageData;

    typedef struct
    {
        const char *diffusion_model_path;
        const char *clip_l_path;
        const char *t5xxl_path;
        const char *vae_path;
        bool clip_on_cpu;
        bool vae_on_cpu;
    } SDInitParams;

    typedef struct
    {
        const char *prompt;
        int width = 512;
        int height = 512;
        int sample_steps = 20;
        float cfg_scale = 1.0f;
    } SDGenerationParams;

    sd_ctx_t *sd_init(SDInitParams params);
    SDImageData sd_generate_image(sd_ctx_t *ctx, SDGenerationParams params);
    SDImageData sd_edit_image(sd_ctx_t *ctx, SDGenerationParams params, const SDImageData *ref_images_ptr, int num_ref_images);
    void sd_free_image_data(SDImageData img);
    void sd_free_context(sd_ctx_t *ctx);
}