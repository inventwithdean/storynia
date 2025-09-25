import { useState } from "react";
import { CharacterLibrary } from "./CharacterLibrary";
import { StoryPage } from "./StoryPage";
import "./Main.css";

export const App = () => {
  const [currentView, setCurrentView] = useState("library");

  const [selectedCharacter, setSelectedCharacter] = useState(null);

  const handleCharacterSelect = (character) => {
    setSelectedCharacter(character);
    setCurrentView("story");
  };

  // Function to switch back to the CharacterLibrary
  const handleBackToLibrary = () => {
    setSelectedCharacter(null);
    setCurrentView("library");
  };

  // Conditionally render the correct component based on the current view
  if (currentView === "story") {
    return (
      <StoryPage character={selectedCharacter} onBack={handleBackToLibrary} />
    );
  }

  // By default, show the library
  return <CharacterLibrary onCharacterSelect={handleCharacterSelect} />;
};
