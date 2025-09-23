document.getElementById("fetch").addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Try sending a ping message to check if content.js is loaded
  chrome.tabs.sendMessage(tab.id, { action: "ping" }, async (res) => {
    if (chrome.runtime.lastError) {
      // Content script not loaded — inject it
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });

      // Retry after injection
      fetchComments(tab.id);
    } else {
      // Already injected
      fetchComments(tab.id);
    }
  });
});

// Add event listener for the Analyse button
document.getElementById("analyse").addEventListener("click", async () => {
  console.log("Analyse button clicked");
  const container = document.getElementById("comments");
  
  // Check if we have comments to analyze
  if (!window.fetchedComments || !window.fetchedComments.length) {
    container.innerHTML = `<p style="color:orange;">Please fetch comments first before analyzing.</p>`;
    return;
  }
  
  // Start the analysis
  analyzeComments(window.fetchedComments);
});

// Function to fetch comments only
async function fetchComments(tabId) {
  console.log("fetchComments function called with tabId:", tabId);
  const container = document.getElementById("comments");
  container.innerHTML = `<div class="loader"></div>Loading comments...`;
  console.log("Loading spinner displayed");

  console.log("Sending message to content script with action: getComments");
  chrome.tabs.sendMessage(
    tabId,
    { action: "getComments" },
    async (response) => {
      console.log("Received response from content script:", response);
      if (chrome.runtime.lastError) {
        container.innerHTML = `<p style="color:red;">Error: ${chrome.runtime.lastError.message}</p>`;
        return;
      }

      if (!response?.comments?.length) {
        console.log("No comments found in response");
        container.innerHTML =
          "<p>No comments found or not supported on this page.</p>";
        return;
      }
      
      console.log(`Found ${response.comments.length} comments`);
      
      // Store comments globally for later analysis
      window.fetchedComments = response.comments;
      
      // Enable the analyse button
      const analyseBtn = document.getElementById("analyse");
      if (analyseBtn) {
        analyseBtn.disabled = false;
      }
      
      // Display comment summary
      displayCommentSummary(response.comments);
    }
  );
}

// Function to display comment summary
function displayCommentSummary(comments) {
  const container = document.getElementById("comments");
  
  // Show comment count and preview
  const previewCount = Math.min(3, comments.length);
  const previewComments = comments.slice(0, previewCount);
  
  let html = `
    <div class="comment-summary">
      <h3>📊 Comments Found: ${comments.length}</h3>
      <p>Click "Analyse" to perform sentiment analysis on these comments.</p>
      
      <div class="comment-preview">
        <h4>Preview (showing ${previewCount} of ${comments.length}):</h4>
  `;
  
  previewComments.forEach((comment, index) => {
    html += `
      <div class="comment-preview-item">
        <strong>${comment.user || "Unknown"}</strong>
        <span class="comment-time">${comment.time}</span>
        <span class="comment-likes">👍 ${comment.likes || "0"}</span>
        <p class="comment-text">${comment.comment}</p>
      </div>
    `;
  });
  
  if (comments.length > previewCount) {
    html += `<p class="more-comments">... and ${comments.length - previewCount} more comments</p>`;
  }
  
  html += `
      </div>
      
      <div class="action-buttons">
        <button id="analyse" class="analyse-btn">🔍 Analyse Comments</button>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Re-attach event listener for the analyse button
  document.getElementById("analyse").addEventListener("click", async () => {
    console.log("Analyse button clicked");
    const container = document.getElementById("comments");
    
    // Check if we have comments to analyze
    if (!window.fetchedComments || !window.fetchedComments.length) {
      container.innerHTML = `<p style="color:orange;">Please fetch comments first before analyzing.</p>`;
      return;
    }
    
    // Start the analysis
    analyzeComments(window.fetchedComments);
  });
}

// Function to analyze comments
async function analyzeComments(comments) {
  console.log("Starting comment analysis...");
  const container = document.getElementById("comments");
  container.innerHTML = `<div class="loader"></div>Loading analysis...`;
  
  // Prepare JSON input for API
  console.log("Processing comment data for API...");
  const commentData = comments.map((c) => ({
    user: c.user || "Unknown",
    time: c.time,
    likes: c.likes || "0",
    comment: c.comment,
  }));
  console.log("Comment data prepared:", commentData);

  const prompt = `
You are a sentiment analysis AI. Classify the following comments into Positive, Negative, and Neutral. 
Return the count and list of comments under each category in the format:
{
  "positive": { "count": X, "comments": [...] },
  "negative": { "count": Y, "comments": [...] },
  "neutral": { "count": Z, "comments": [...] }
}
Input Comments: ${JSON.stringify(commentData, null, 2)}
`;

  // Get API key
  let api;
  try {
    api = "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";
    console.log("API key loaded successfully");
  } catch (error) {
    console.error("Failed to load API key:", error);
    container.innerHTML = `<p style="color:red;">Failed to load API key: ${error.message}</p>`;
    return;
  }
  
  try {
    console.log("=== STARTING API CALL ===");
    console.log("Starting API call to OpenRouter...");
    console.log("Request payload:", {
      model: "z-ai/glm-4.5-air:free",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });
    
    // Add timeout to the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error("API request timed out after 30 seconds");
      controller.abort();
    }, 30000); // 30 second timeout
    
    const glmResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${api}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "z-ai/glm-4.5-air:free",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        }),
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);
    
    console.log("API response status:", glmResponse.status);
    console.log("API response headers:", Object.fromEntries(glmResponse.headers.entries()));
    
    if (!glmResponse.ok) {
      const errorText = await glmResponse.text();
      console.error("API request failed:", glmResponse.status, errorText);
      throw new Error(`API request failed: ${glmResponse.status} - ${errorText}`);
    }

    const data = await glmResponse.json();
    console.log("Raw API response:", data);

    console.log("Checking API response structure...");
    console.log("Data structure:", {
      hasChoices: !!data.choices,
      choicesLength: data.choices?.length,
      firstChoice: data.choices?.[0],
      hasMessage: !!data.choices?.[0]?.message,
      hasContent: !!data.choices?.[0]?.message?.content
    });
    
    if (
      !data.choices ||
      !data.choices.length ||
      !data.choices[0].message?.content
    ) {
      console.error("Unexpected API response structure:", data);
      container.innerHTML = `<p style="color:red;">API returned an unexpected format. Check console for details.</p>`;
      return;
    }

    const modelResponse = data.choices[0].message.content;
    console.log("Model response content:", modelResponse);
    console.log("Attempting to parse JSON from model response...");
    
    let parsed;
    try {
      parsed = JSON.parse(modelResponse);
      console.log("Successfully parsed JSON response:", parsed);
    } catch (e) {
      console.error("JSON parsing failed:", e);
      console.error("Raw content that failed to parse:", modelResponse);
      console.error("Content type:", typeof modelResponse);
      console.error("Content length:", modelResponse?.length);
      
      // Try to extract any JSON-like content
      const jsonMatch = modelResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log("Found potential JSON content:", jsonMatch[0]);
        try {
          parsed = JSON.parse(jsonMatch[0]);
          console.log("Successfully parsed extracted JSON:", parsed);
        } catch (extractError) {
          console.error("Failed to parse extracted JSON:", extractError);
        }
      }
      
      if (!parsed) {
        container.innerHTML = `<p style="color:red;">Failed to parse response JSON from model. Check console for details.</p>`;
        return;
      }
    }

    // Validate the parsed response structure
    console.log("Validating parsed response structure...");
    if (!parsed.positive || !parsed.negative || !parsed.neutral) {
      console.error("Invalid response structure - missing required fields:", parsed);
      container.innerHTML = `<p style="color:red;">Invalid response structure from model. Check console for details.</p>`;
      return;
    }
    
    console.log("Response validation passed. Rendering results...");

    container.innerHTML = `
      <div class="analysis-results">
        <h2>🎯 Sentiment Analysis Results</h2>
        <div class="sentiment-section positive">
          <h3>😊 Positive (${parsed.positive.count || 0})</h3>
          ${(parsed.positive.comments || []).map((c) => `<p>${c}</p>`).join("")}
        </div>
        <div class="sentiment-section negative">
          <h3>😞 Negative (${parsed.negative.count || 0})</h3>
          ${(parsed.negative.comments || []).map((c) => `<p>${c}</p>`).join("")}
        </div>
        <div class="sentiment-section neutral">
          <h3>😐 Neutral (${parsed.neutral.count || 0})</h3>
          ${(parsed.neutral.comments || []).map((c) => `<p>${c}</p>`).join("")}
        </div>
        
        <div class="action-buttons">
          <button id="fetch" class="fetch-btn">🔄 Fetch New Comments</button>
        </div>
      </div>
    `;
    
    console.log("Successfully rendered sentiment analysis results");
    console.log("=== API CALL COMPLETED SUCCESSFULLY ===");
    
    // Re-attach event listener for the fetch button
    document.getElementById("fetch").addEventListener("click", async () => {
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      fetchComments(tab.id);
    });
    
  } catch (error) {
    console.error("=== API CALL FAILED ===");
    console.error("API call failed with error:", error);
    console.error("Error stack:", error.stack);
    
    if (error.name === 'AbortError') {
      container.innerHTML = `
        <p style="color:red;">Request timed out. Please try again.</p>
        <div class="action-buttons">
          <button id="fetch" class="fetch-btn">🔄 Fetch New Comments</button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <p style="color:red;">API Error: ${error.message}</p>
        <div class="action-buttons">
          <button id="fetch" class="fetch-btn">🔄 Fetch New Comments</button>
        </div>
      `;
    }
    
    // Re-attach event listener for the fetch button
    document.getElementById("fetch").addEventListener("click", async () => {
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      fetchComments(tab.id);
    });
  }
}
