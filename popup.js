async function getRealActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  // If popup window is focused → it becomes active tab → BAD
  // So instead find the last normal (non-extension) tab
  const realTabs = tabs.filter((t) => !t.url.startsWith("chrome-extension://"));

  if (realTabs.length > 0) return realTabs[0];

  // If popup stole focus, find ANY non-extension tab
  const allTabs = await chrome.tabs.query({});
  const normalTabs = allTabs.filter(
    (t) => !t.url.startsWith("chrome-extension://")
  );
  return normalTabs[0] || null;
}

document.getElementById("fetch").addEventListener("click", async () => {
  // let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  let tab = await getRealActiveTab();

  if (!tab || !tab.url) {
    alert("Please open a social media page first.");
    return;
  }

  // if (tab.url.startsWith("chrome-extension://")) {
  //   alert("Open a social media page and then click Fetch.");
  //   return;
  // }
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

  chrome.storage.local.remove("savedComments");

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
      chrome.storage.local.set({ savedComments: response.comments });

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
    html += `<p class="more-comments">... and ${
      comments.length - previewCount
    } more comments</p>`;
  }

  html += `
      </div>
      
      <div id="analyse" class="analyse-btn">
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
    neutral: { count: 0, comments: [] },
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
    const safeLabel =
      label === "positive" || label === "negative" || label === "neutral"
        ? label
        : "neutral";

    // Store sentiment in the comment object for later use
    c.sentiment = safeLabel;

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
    if (top === "positive" || top === "negative" || top === "neutral")
      return top;
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
  const runners = new Array(Math.min(limit, queue.length))
    .fill(null)
    .map(async () => {
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
      
      <div class="button-container">
        <button id="furtherAnalyze" class="analyse-btn" style="margin-left: 5px">📊 Detailed Analysis</button>
      </div>
    </div>
  `;

  // Re-attach event listeners
  document.getElementById("fetch").addEventListener("click", async () => {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    fetchComments(tab.id);
  });

  document.getElementById("furtherAnalyze").addEventListener("click", () => {
    performFurtherAnalysis(window.fetchedComments);
  });
}

// Add new functions for further analysis
function performFurtherAnalysis(comments) {
  if (!comments || comments.length === 0) {
    alert("No comments available for analysis!");
    return;
  }

  // ----- 1. Comment Count -----
  const totalComments = comments.length;

  // ----- 2. Top Commenters -----
  const userCount = {};
  comments.forEach((c) => {
    const user = c.user || "Unknown";
    userCount[user] = (userCount[user] || 0) + 1;
  });

  const topUsers = Object.entries(userCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // ----- 3. Most Liked Comments -----
  const mostLiked = [...comments]
    .sort((a, b) => parseInt(b.likes || 0) - parseInt(a.likes || 0))
    .slice(0, 5);

  // ----- 4. Comment Length Analysis -----
  const avgLength =
    comments.reduce((acc, c) => acc + c.comment.length, 0) / totalComments;

  // ----- 5. Time-Based Activity -----
  const timeActivity = {};
  comments.forEach((c) => {
    const t = c.time || "unknown";
    timeActivity[t] = (timeActivity[t] || 0) + 1;
  });

  //   renderAnalysisPage({
  //     totalComments,
  //     topUsers,
  //     mostLiked,
  //     avgLength: Math.round(avgLength),
  //     timeActivity,
  //   });
  // }
  const sentimentTimeline = comments.map((c, i) => ({
    index: i + 1,
    sentiment: c.sentiment || "neutral", // you must add sentiment into each comment object
  }));

  renderAnalysisPage({
    totalComments,
    topUsers,
    mostLiked,
    avgLength: Math.round(avgLength),
    timeActivity,
    sentimentTimeline,
    comments,
  });
}

function renderAnalysisPage(data) {
  const container = document.getElementById("comments");

  container.innerHTML = `
    <div class="detailed-analysis">
      <h2>📊 Detailed Analysis</h2>
      
      <div class="analysis-card">
        <h3>📈 Overview</h3>
        <p>Total Comments: ${data.totalComments}</p>
        <p>Average Comment Length: ${data.avgLength} characters</p>
      </div>

      <div class="analysis-card">
        <h3>👥 Top Commenters</h3>
        <ul>
          ${data.topUsers
            .map(([user, count]) => `<li>${user}: ${count} comments</li>`)
            .join("")}
        </ul>
      </div>

      <div class="analysis-card">
        <h3>💖 Most Liked Comments</h3>
        <ul>
          ${data.mostLiked
            .map(
              (c) =>
                `<li>${c.likes} likes: "${c.comment.substring(0, 50)}${
                  c.comment.length > 50 ? "..." : ""
                }"</li>`
            )
            .join("")}
        </ul>
      </div>

      <div class="analysis-card">
        <h3>⏰ Time Activity</h3>
        <ul>
          ${Object.entries(data.timeActivity)
            .map(([time, count]) => `<li>${time}: ${count} comments</li>`)
            .join("")}
        </ul>
      </div>

    <!-- EXISTING CARDS -->

    <!-- NEW SECTION: WORD CLOUD -->
    <div class="analysis-card">
      <h3>🌥 Word Cloud</h3>
      <canvas id="wordCloudCanvas" width="250" height="150"></canvas>
    </div>

    <!-- NEW SECTION: PIE CHART -->
    <div class="analysis-card">
      <h3>🟢🔴🟡 Sentiment Distribution</h3>
      <canvas id="sentimentPieChart" width="400" height="300"></canvas>
    </div>

    <!-- NEW SECTION: TIMELINE BAR GRAPH -->
    <div class="analysis-card">
      <h3>📈 Sentiment Timeline</h3>
      <canvas id="sentimentTimelineChart" width="400" height="300"></canvas>
    </div>


      <button id="backToSentiment" class="fetch-btn">← Back to Sentiment Analysis</button>
    </div>
  `;

  // ----- 1. WORD CLOUD -----
  generateWordCloud(data.comments);

  // ----- 2. PIE CHART -----

  generatePieChart(data);

  // ----- 3. TIMELINE GRAPH -----
  generateTimelineChart(data.sentimentTimeline);

  // Add back button functionality
  document.getElementById("backToSentiment").addEventListener("click", () => {
    displayAnalysisResults({
      positive: { count: 0, comments: [] },
      negative: { count: 0, comments: [] },
      neutral: { count: 0, comments: [] },
      ...window.lastAnalysisResults,
    });
  });
}

function generateWordCloud(comments) {
  const words = comments
    .map((c) => c.comment)
    .join(" ")
    .split(/\s+/);
  const frequencies = {};

  words.forEach((w) => {
    w = w.toLowerCase();
    if (!frequencies[w]) frequencies[w] = 0;
    frequencies[w]++;
  });

  const entries = Object.entries(frequencies);

  WordCloud(document.getElementById("wordCloudCanvas"), {
    list: entries,
    gridSize: 10,
    weightFactor: 2,
    color: "random-dark",
    backgroundColor: "#f8f8f8",
  });
}

function generatePieChart(data) {
  const ctx = document.getElementById("sentimentPieChart").getContext("2d");

  const positive = data.comments.filter(
    (c) => c.sentiment === "positive"
  ).length;
  const negative = data.comments.filter(
    (c) => c.sentiment === "negative"
  ).length;
  const neutral = data.comments.filter((c) => c.sentiment === "neutral").length;

  new Chart(ctx, {
    type: "pie",
    data: {
      labels: ["Positive", "Negative", "Neutral"],
      datasets: [
        {
          data: [positive, negative, neutral],
          backgroundColor: ["#4CAF50", "#F44336", "#FFC107"],
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            usePointStyle: true,
            padding: 15,
          },
        },
        title: {
          display: true,
          text: "Sentiment Distribution",
          padding: 20,
        },
      },
    },
  });
}
function generateTimelineChart(timeline) {
  const ctx = document
    .getElementById("sentimentTimelineChart")
    .getContext("2d");

  // Group comments by time period and count sentiments
  const timeGroups = {};

  timeline.forEach((t, index) => {
    // Use the actual comment's time if available, otherwise use index
    const comment = window.fetchedComments[index];
    const timeLabel = comment?.time || `Comment ${t.index}`;

    if (!timeGroups[timeLabel]) {
      timeGroups[timeLabel] = { positive: 0, negative: 0, neutral: 0 };
    }

    const sentiment = t.sentiment || "neutral";
    timeGroups[timeLabel][sentiment]++;
  });

  // Convert to arrays for Chart.js
  const labels = Object.keys(timeGroups);
  const positiveData = labels.map((label) => timeGroups[label].positive);
  const negativeData = labels.map((label) => timeGroups[label].negative);
  const neutralData = labels.map((label) => timeGroups[label].neutral);

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Positive",
          data: positiveData,
          backgroundColor: "#4CAF50",
        },
        {
          label: "Negative",
          data: negativeData,
          backgroundColor: "#F44336",
        },
        {
          label: "Neutral",
          data: neutralData,
          backgroundColor: "#FFC107",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            usePointStyle: true,
            padding: 15,
          },
        },
        title: {
          display: true,
          text: "Sentiment Distribution Over Time",
          padding: 20,
        },
      },
      scales: {
        x: {
          stacked: true,
          title: {
            display: true,
            text: "Time Period (hours/days ago)",
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45,
          },
        },
        y: {
          stacked: true,
          display: true,
          title: {
            display: true,
            text: "Number of Comments",
          },
          beginAtZero: true,
        },
      },
    },
  });
}
