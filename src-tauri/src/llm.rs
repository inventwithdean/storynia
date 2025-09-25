use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Message {
    role: String,
    content: String,
}

// A single choice in the API response.
#[derive(Deserialize, Debug)]
struct Choice {
    message: Message,
}

// The overall structure of the API response.
#[derive(Deserialize, Debug)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StoryContinuation {
    text: String,
    image_prompt: String,
}

#[tauri::command]
pub async fn get_llm_completion(messages: Vec<Message>) -> Result<StoryContinuation, String> {
    let api_key = "";
    let api_url = "https://api.groq.com/openai/v1/chat/completions";
    let client = Client::new();
    let story_response_schema = json!({
        "name": "Continuation",
        "strict": true,
        "schema": {
            "type": "object",
            "properties": {
                "text": {
                "type": "string",
                },
            "image_prompt": {
                "type": "string",
            },
            },
            "required": ["text", "image_prompt"],
            "additionalProperties": false,
        }
    });
    let response_format = json!({ "type": "json_schema", "json_schema": story_response_schema });
    let request_payload = json!({
        // "model": "gemini-2.5-flash-lite",
        "model": "openai/gpt-oss-120b",
        "messages": messages,
        "response_format": response_format
    });
    println!("Sending Request to LLM");
    let response = client
        .post(api_url)
        .bearer_auth(&api_key)
        .json(&request_payload)
        .send()
        .await
        .unwrap();
    if response.status().is_success() {
        let chat_response = response.json::<ChatResponse>().await.unwrap();
        if let Some(choice) = chat_response.choices.get(0) {
            let content_str = choice.message.content.trim();
            match serde_json::from_str::<StoryContinuation>(content_str) {
                Ok(story_part) => Ok(story_part),
                Err(e) => {
                    eprintln!("Failed to parse assistant's response: {}", e);
                    Err(e.to_string())
                }
            }
        } else {
            println!("No choices returned from the API.");
            Err("No choices returned from the API".to_string())
        }
    } else {
        // If the request failed, print the status and the error body.
        let status = response.status();
        let error_body = response.text().await.unwrap();
        eprintln!("Request failed with status: {}", status);
        eprintln!("Error: {}", error_body);
        Err("Request Failed".to_string())
    }
}
