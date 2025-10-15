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
      
      <div id="analyse" class="analyse-btn">
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
  
  // Show initial progress
  container.innerHTML = `
    <div class="analysis-progress">
      <h3>🔍 Analyzing Comments...</h3>
      <div class="progress-bar">
        <div class="progress-fill" id="progressFill"></div>
      </div>
      <p id="progressText">Starting...</p>
    </div>
  `;
  
  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");

  const total = comments.length;
  let completed = 0;

  // Results accumulator
  const results = {
    positive: { count: 0, comments: [] },
    negative: { count: 0, comments: [] },
    neutral:  { count: 0, comments: [] }
  };

  // Update progress UI helper
  const updateProgress = () => {
    const percent = Math.round((completed / total) * 100);
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `Analyzed ${completed}/${total} comments (${percent}%)`;
  };

  // Concurrency-limited processing
  const CONCURRENCY = 5; // adjust for your CPU/GPU
  await processWithConcurrency(comments, CONCURRENCY, async (c) => {
    const label = await classifyComment(c.comment);
    // Fallback if API fails
    const safeLabel = label === "positive" || label === "negative" || label === "neutral" ? label : "neutral";
    results[safeLabel].count += 1;
    results[safeLabel].comments.push(c.comment);
    completed += 1;
    updateProgress();
  });

  // Render
  displayAnalysisResults(results);
}

// Classify a single comment via local Flask server
async function classifyComment(text) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout per request
  try {
    const res = await fetch("http://localhost:5000/predict", {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const t = await res.text();
      console.warn("/predict error:", res.status, t);
      return "neutral";
    }
    const data = await res.json();
    // Expected shape: { input: string, sentiment: { negative: float, neutral: float, positive: float } }
    const probs = data?.sentiment || {};
    const entries = Object.entries(probs);
    if (!entries.length) return "neutral";
    entries.sort((a, b) => b[1] - a[1]);
    const top = entries[0][0];
    if (top === "positive" || top === "negative" || top === "neutral") return top;
    return "neutral";
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("/predict request failed:", err);
    return "neutral";
  }
}

// Process array with a concurrency limit
async function processWithConcurrency(items, limit, worker) {
  const queue = items.slice();
  const runners = new Array(Math.min(limit, queue.length)).fill(null).map(async () => {
    while (queue.length) {
      const next = queue.shift();
      try {
        // eslint-disable-next-line no-await-in-loop
        await worker(next);
      } catch (e) {
        console.warn("Worker error:", e);
      }
    }
  });
  await Promise.all(runners);
}

// Function to display analysis results
function displayAnalysisResults(results) {
  const container = document.getElementById("comments");
  
  container.innerHTML = `
    <div class="analysis-results">
      <h2>🎯 Sentiment Analysis Results</h2>
      <div class="sentiment-section positive">
        <h3>😊 Positive (${results.positive.count || 0})</h3>
        ${(results.positive.comments || []).map((c) => `<p>${c}</p>`).join("")}
      </div>
      <div class="sentiment-section negative">
        <h3>😞 Negative (${results.negative.count || 0})</h3>
        ${(results.negative.comments || []).map((c) => `<p>${c}</p>`).join("")}
      </div>
      <div class="sentiment-section neutral">
        <h3>😐 Neutral (${results.neutral.count || 0})</h3>
        ${(results.neutral.comments || []).map((c) => `<p>${c}</p>`).join("")}
      </div>
      
      <div class="action-buttons">
        <button id="fetch" class="fetch-btn">🔄 Fetch New Comments</button>
      </div>
    </div>
  `;
  
  // Re-attach event listener for the fetch button
  document.getElementById("fetch").addEventListener("click", async () => {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    fetchComments(tab.id);
  });
}
