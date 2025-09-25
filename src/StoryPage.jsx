import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { appDataDir, join, resolve } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

const systemPrompt = `
You are a story weaver who generates beautiful stories along with image_prompts to be used by a image generation model.
The user selects a base character and tells you about it, it can be used in future image_prompts like 'the boy is now near a car', or 'the rat is now on a cooker' 
{"text": "There was a curious little boy, full of wonder, exploring a lush, green jungle. He loved to discover new things.", "image_prompt": "A cute, adventurous little boy character, around 6-7 years old. He has bright, curious eyes and a friendly smile. He's wearing a simple t-shirt and shorts, and perhaps a small backpack. He is standing in a vibrant, dense jungle environment with large green leaves, vines, and a hint of sunlight filtering through the canopy. The style should be whimsical and child-friendly, like a storybook illustration."}

To continue the story, output something like
{"text": "Curiosity leading the way, the boy carefully stepped inside the house. The interior was simple and warm, and to his astonishment, in the corner of the main room, there was a television set! It seemed so out of place in the middle of the jungle.", "image_prompt": "Change the background to a new room. The room is cozy with wooden walls and perhaps a simple rug on the floor. In one corner, there's an old-fashioned television set with a glowing screen showing colorful images (perhaps a nature documentary or a cartoon). The boy is standing a few feet from the TV, captivated by what he sees, with a look of wide-eyed amazement"}
Remember that each image generation takes the immediate previous image as a reference, so you can chain the environments and interactions accordingly and maintain character consistency. And never use names inside image tag, use things like the boy, the girl, the animal, the thing, like the "boy wearing green hat" instead of a name, so that image model understands it.
Remember to be minimal in your image_prompts like in the example. Like if there was a character which went to watch tv now, then image_prompt should be like: "change the background to a room with a television. The boy is now happy.", No need to repeat anything from previous image_prompts

The image editing model is very specific, here are the details which may be of help
It is really good at straightforward object modification, for example if we want to change the colour of an object, we can prompt it.
like 'Car changed to red'
and for character consistency, you can follow this framework to keep the same character across edits:
Establish the reference: Begin by clearly identifying your character
“This person…” or “The woman with short black hair…”
Specify the transformation: Clearly state what aspects are changing
Environment: “…now in a tropical beach setting”
Activity: “…now picking up weeds in a garden”
Style: “Transform to Claymation style while keeping the same person”
Preserve identity markers: Explicitly mention what should remain consistent
“…while maintaining the same facial features, hairstyle, and expression”
“…keeping the same identity and personality”
“…preserving their distinctive appearance”

Remember to output around 5-7 sentences for story's text. And Try to specify pose changes too, as if you don't, then pose remains same, which may not be what we want, for example when character changes room. You can do 'Change the boy's pose to ... '
`;

const ImageBlock = ({ block }) => {
  if (block.status === "generating") {
    return (
      <div className="image-block">
        <div className="image-placeholder">
          <div className="shimmer-effect"></div>
          <svg
            className="magic-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2.6l2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.4-4.6 2.4.9-5.2-3.8-3.7 5.2-.8L12 2.6zm0 8.4l-1.5 3.1-3.4.5 2.5 2.4-.6 3.4 3-1.6 3 1.6-.6-3.4 2.5-2.4-3.4-.5L12 11z" />
          </svg>
          <span>Weaving visuals...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="image-block">
      <img src={block.url} alt={block.prompt} className="story-image" />
    </div>
  );
};
export const StoryPage = ({ character, onBack }) => {
  const previousImagePath = useRef(character.img_path);
  const chatMessages = useRef([
    {
      role: "system",
      content: systemPrompt,
    },
  ]);

  const createInitialStory = () => {
    return [
      { id: Date.now(), type: "text", content: character.description },
      {
        id: Date.now() + 1,
        type: "image",
        prompt: "Initial character image",
        status: "completed",
        url: convertFileSrc(character.img_path),
        outputPath: character.img_path,
      },
    ];
  };
  const [storyBlocks, setStoryBlocks] = useState(createInitialStory);
  const [userInput, setUserInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasEndRef = useRef(null);

  useEffect(() => {
    const unlistenPromise = listen("IMAGE_GENERATED", (event) => {
      console.log("Event 'IMAGE_GENERATED' received:", event.payload);

      const payload = event.payload;
      const filePath = payload["file_path"];

      previousImagePath.current = filePath;
      console.log(
        "Previous image path changed to: ",
        previousImagePath.current
      );
      const assetUrl = convertFileSrc(filePath);
      console.log(assetUrl);
      setStoryBlocks((prevBlocks) =>
        prevBlocks.map((block) => {
          // We find the block by matching the outputPath we stored earlier
          if (block.type === "image" && block.outputPath === filePath) {
            return { ...block, status: "completed", url: assetUrl };
          }
          return block;
        })
      );
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    canvasEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [storyBlocks]);

  const handleGenerate = async () => {
    if (!userInput.trim() || isGenerating) return;

    setIsGenerating(true);
    const currentUserInput = userInput;
    const newUserTextBlock = {
      id: Date.now(),
      type: "user_prompt",
      content: userInput,
    };
    setStoryBlocks((prevBlocks) => [...prevBlocks, newUserTextBlock]);
    setUserInput("");

    try {
      // Build the story context for the LLM
      const storyContext = storyBlocks
        .map((block) => {
          if (block.type === "text") return block.content;
          if (block.type === "image")
            return `<image_prompt>${block.prompt}</image_prompt>`;
          return "";
        })
        .join("\n");
      let fullUserPrompt = `
CURRENT STORY:
${storyContext}

---

USER'S INSTRUCTION:
${currentUserInput}
      `;

      chatMessages.current.push({
        role: "user",
        content: fullUserPrompt,
      });

      console.log("Sent: ", chatMessages.current);

      const response = await invoke("get_llm_completion", {
        messages: chatMessages.current,
      });

      console.log(response);

      const imagePromptFromLlm = response.image_prompt;
      const storyText = response.text;

      chatMessages.current.push({
        role: "assistant",
        content: `{"text": ${storyText}, "image_prompt": ${imagePromptFromLlm}}`,
      });

      const newStoryTextBlock = {
        id: Date.now(),
        type: "text",
        content: storyText,
      };

      setStoryBlocks((prevBlocks) => [...prevBlocks, newStoryTextBlock]);
      const dataDir = await appDataDir();
      const outputPath = await join(dataDir, `generated_${Date.now()}.png`);

      const newImageBlock = {
        id: Date.now() + 1,
        type: "image",
        prompt: imagePromptFromLlm,
        status: "generating",
        url: null,
        outputPath: outputPath,
      };
      setStoryBlocks((prevBlocks) => [...prevBlocks, newImageBlock]);

      console.log(`Invoking 'edit_image' with prompt: "${imagePromptFromLlm}"`);
      // We are continuing the story
      await invoke("edit_image", {
        prompt: imagePromptFromLlm,
        outputPath: outputPath,
        refImagePaths: [previousImagePath.current],
      });
    } catch (error) {
      console.error("Failed to invoke 'generate_image':", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="story-page bg-gray-900 text-white flex flex-col h-screen font-sans">
      <header className="flex-shrink-0 p-4 border-b border-gray-700/50 bg-gray-900/70 backdrop-blur-sm z-10">
        <button
          onClick={onBack}
          className="text-cyan-400 hover:text-cyan-300 transition-colors duration-200 text-sm font-medium flex items-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back to Library
        </button>
      </header>

      <main className="chat-container flex-1 overflow-y-auto p-6 min-w-4xl max-w-9xl mx-auto space-y-8">
        {storyBlocks.map((block) => {
          if (block.type === "user_prompt") {
            return (
              <div key={block.id} className="flex justify-end">
                <p className="bg-purple-800 rounded-lg p-3 max-w-md text-lg/relaxed font-serif text-purple-100">
                  {block.content}
                </p>
              </div>
            );
          }
          if (block.type === "text") {
            return (
              <p
                key={block.id}
                className="story-text text-gray-200 text-lg/relaxed font-serif max-w-2xl mx-auto"
              >
                {block.content}
              </p>
            );
          }
          if (block.type === "image") {
            return <ImageBlock key={block.id} block={block} />;
          }
          return null;
        })}
        <div ref={canvasEndRef} />
      </main>

      <footer className="flex-shrink-0 bg-gray-800/50 backdrop-blur-sm border-t border-gray-700/50 p-4">
        <div className="flex items-start gap-4 max-w-3xl mx-auto">
          <textarea
            className="flex-1 bg-gray-700 rounded-lg p-3 text-white placeholder-gray-400 resize-none border border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-shadow duration-200"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder={
              isGenerating ? "The story is unfolding..." : "What happens next?"
            }
            disabled={isGenerating}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            rows={1}
          />
          <button
            className="flex-shrink-0 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-full p-3 transition-colors duration-200 shadow-lg"
            onClick={handleGenerate}
            disabled={isGenerating || !userInput.trim()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </footer>
    </div>
  );
};
