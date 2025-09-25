# Storynia

**Your Personal AI Storytelling Studio, With Absolute Privacy.**

---

### Demo Video

**[TODO: Link YT Video]**

### Inspiration

In the age of AI, creating visual stories should be accessible to everyone. However, generating *consistent* characters across different scenes is incredibly difficult, often requiring complex tools, powerful cloud GPUs, and expensive subscriptions. **Storynia** was born from a simple idea: what if anyone could create personalized, visually consistent stories right from their own computer, ensuring both privacy and creative ownership?

### What It Does

Storynia is a cross-platform desktop app that transforms you into a visual storyteller. The workflow is simple:

1.  **Create Your Character:** Import an image of yourself, your pet, or a friend, or generate a new character concept—all completely offline. This character becomes the star of your story.
2.  **Start the Narrative:** Write a simple prompt to kick off the story, like *"He decides to go and watch TV."*
3.  **AI Co-Author:** Using the ultra-fast Groq API with `gpt-oss-120b`, Storynia continues the narrative, crafting the next part of the story and generating a detailed image prompt.
4.  **Local Magic:** The image prompt is sent to a local, built-in instance of `stable-diffusion.cpp`. A new, consistent image is generated right on your machine, matching the story's progression.

The result is a seamless, iterative process of co-creation between you and the AI, producing a unique visual story with a consistent main character.

### Key Features

* **Offline-First & Private:** Character creation and image generation happen 100% on your device. Your data stays with you.
* **Hyper-Personalization:** Use your own photos to inject yourself directly into your stories.
* **Cost Efficient**: This approach is highly cost efficient as only story's text generation happens on cloud resulting in over 1000 stories per $1.
* **Hardware Friendly**: You don't need GPUs with 16 or 24GB of VRAM, this works even on a 8GB VRAM GPU while having very minimal loss in output quality.
* **Consistent Characters:** Our workflow is designed to maintain character consistency across various actions, poses, and environments.
* **Blazing Fast Storytelling:** The Groq LPU Inference Engine provides near-instant story and prompt generation.
* **Cross-Platform:** Built with Tauri and Rust, Storynia is designed to run on Windows, macOS, and Linux. We currently provide Windows (x64) Binaries.

### Tech Stack & Architecture

Storynia is built on a unique hybrid architecture that combines the best of local and cloud processing.

* **Frontend:** React with Tauri for a lightweight, native desktop experience.
* **AI Inference:** `stable-diffusion.cpp` for fast image generation.
* **Model**: `flux-kontext-dev` by Black Forest Labs.
* **FFI:** A custom-built Rust Foreign Function Interface (FFI) layer (`sd_api.lib`) that allows the Rust frontend to communicate directly with the C++ Stable Diffusion library.
* **LLM:** Groq API (`gpt-oss-120b`) for high-speed text generation.

### Releases: 
#### https://github.com/inventwithdean/storynia/releases/tag/v0.1.0-alpha

### Future Work:

* Export stories to PDFs.
* Add multilingual features.
* Add TTS.