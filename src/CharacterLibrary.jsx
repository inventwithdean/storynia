import { path } from "@tauri-apps/api";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import {
  BaseDirectory,
  copyFile,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { useEffect, useState } from "react";

const CharacterCard = ({ character, onCharacterSelect }) => {
  return (
    <div
      className="group relative overflow-hidden rounded-lg bg-gray-800 shadow-lg transition-transform duration-300 hover:scale-105 hover:shadow-cyan-500/30"
      onClick={() => onCharacterSelect(character)}
    >
      <img
        src={convertFileSrc(character.img_path)}
        alt={character.description}
        className="h-64 w-full object-cover"
      />
      <div className="absolute bottom-0 left-0 w-full bg-black bg-opacity-60 p-4 backdrop-blur-sm">
        <p className="text-sm text-gray-200 truncate">
          {character.description}
        </p>
      </div>
    </div>
  );
};

export const CharacterLibrary = ({ onCharacterSelect }) => {
  // [{description: string, img_path: string}]
  const [characters, setCharacters] = useState([]);
  const [isGenerateModalOpen, setGenerateModalOpen] = useState(false);
  const [uploadFilePath, setUploadFilePath] = useState("");
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadDescription, setUploadDescription] = useState("");
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const loadCharacters = async () => {
    if (!(await exists("Characters", { baseDir: BaseDirectory.AppData }))) {
      await mkdir("Characters", { baseDir: BaseDirectory.AppData });
    }
    if (await exists("characters.json", { baseDir: BaseDirectory.AppData })) {
      const content = await readTextFile("characters.json", {
        baseDir: BaseDirectory.AppData,
      });
      // Set the library
      let characterLibrary = JSON.parse(content);
      setCharacters(characterLibrary["characters"] || []);
    } else {
      setCharacters([]);
    }
  };

  const addCharacterImageToLibrary = async (imgPath, description) => {
    // Get file's base name
    const fileName = await path.basename(imgPath);
    // Copy this image to AppData/Characters/
    await copyFile(imgPath, `Characters/${fileName}`, {
      toPathBaseDir: BaseDirectory.AppData,
    });
    // Need to set description somehow,
    const characterDetails = {
      description: description,
      img_path: imgPath,
    };
    // Create library
    let characterLibrary = { characters: [] };
    // Check if it already exists
    if (await exists("characters.json", { baseDir: BaseDirectory.AppData })) {
      const content = await readTextFile("characters.json", {
        baseDir: BaseDirectory.AppData,
      });
      // Set the library
      characterLibrary = JSON.parse(content);
    }
    // Add character
    characterLibrary.characters.push(characterDetails);
    // Write JSON
    await writeTextFile(
      "characters.json",
      JSON.stringify(characterLibrary, null, 2),
      {
        baseDir: BaseDirectory.AppData,
      }
    );
    setCharacters(characterLibrary.characters);
  };

  const handleUploadClick = async () => {
    const selectedPath = await open({
      multiple: false,
      filters: [{ name: "Image", extensions: ["jpg", "jpeg", "png"] }],
    });
    // Return if img_path is not valid
    if (typeof selectedPath === "string" && selectedPath) {
      setUploadFilePath(selectedPath);
      const fileName = await path.basename(selectedPath);
      setUploadDescription("Set description");
      setUploadModalOpen(true);
    }
  };

  const handleSaveUploadedCharacter = async () => {
    if (!uploadFilePath || !uploadDescription.trim()) {
      alert("Please select a file and provide a description");
      return;
    }
    await addCharacterImageToLibrary(uploadFilePath, uploadDescription);
    setUploadModalOpen(false);
    setUploadFilePath("");
    setUploadDescription("");
  };

  const handleStartGeneration = async () => {
    if (!generationPrompt.trim()) {
      alert("Please enter a prompt to generate a character.");
      return;
    }
    setIsGenerating(true);
    const appDataDirPath = await path.appDataDir();
    const outputPath = await join(
      appDataDirPath,
      `character_${Date.now()}.png`
    );
    await invoke("generate_image", {
      prompt: generationPrompt,
      outputPath: outputPath,
    });
  };

  useEffect(() => {
    // Loads characters and shows them in library form
    loadCharacters();

    const unlistenPromise = listen("IMAGE_GENERATED", async (event) => {
      const payload = event.payload;
      const filePath = payload["file_path"];
      const description = payload["prompt"];
      console.log(filePath, description);
      const fileName = await path.basename(filePath);

      if (fileName.split("_")[0] === "character") {
        await addCharacterImageToLibrary(filePath, description);
        setGenerateModalOpen(false);
        setIsGenerating(false);
        setGenerationPrompt("");
      }
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <div className="bg-gray-900 text-white min-h-screen p-8 font-sans">
      {/* Header */}
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold tracking-tight">Character Library</h1>
        <div className="flex gap-4">
          <button
            onClick={handleUploadClick}
            className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-300"
          >
            Upload New Character
          </button>
          <button
            onClick={() => setGenerateModalOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-300"
          >
            Generate AI Character
          </button>
        </div>
      </header>

      {/* Character Grid */}
      {characters.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {characters.map((char, index) => (
            <CharacterCard
              key={index}
              character={char}
              onCharacterSelect={onCharacterSelect}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-gray-400 text-xl">Your library is empty.</p>
          <p className="text-gray-500 mt-2">
            Upload or generate a character to get started!
          </p>
        </div>
      )}

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Add Character Details</h2>
            {uploadFilePath && (
              <p className="text-sm text-gray-400 mb-4">
                File: {uploadFilePath}
              </p>
            )}
            <textarea
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              placeholder="Enter character description..."
              className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              rows={4}
            />
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => setUploadModalOpen(false)}
                className="bg-gray-600 hover:bg-gray-700 py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveUploadedCharacter}
                className="bg-cyan-600 hover:bg-cyan-700 py-2 px-4 rounded-lg transition-colors"
              >
                Save Character
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Modal */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">
              Generate Character with AI
            </h2>
            <p className="text-gray-400 mb-4 text-sm">
              Describe the character you want to create. This description will
              be used as the prompt.
            </p>
            <textarea
              value={generationPrompt}
              onChange={(e) => setGenerationPrompt(e.target.value)}
              placeholder="e.g., A stoic elven ranger with a longbow, ancient forest background, hyperrealistic..."
              className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={6}
            />
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => setGenerateModalOpen(false)}
                className="bg-gray-600 hover:bg-gray-700 py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartGeneration}
                className="bg-purple-600 hover:bg-purple-700 py-2 px-6 rounded-lg transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isGenerating}
              >
                {isGenerating && (
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                )}
                {isGenerating ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
