function scrapeComments() {
  const url = window.location.href;
  const comments = [];

  if (url.includes("youtube.com")) {
    document.querySelectorAll("#content-text").forEach((el) => {
      const thread = el.closest("ytd-comment-thread-renderer");
      const user =
        thread?.querySelector("#author-text span")?.innerText.trim() ||
        "Unknown";
      const time =
        thread?.querySelector("#published-time-text a")?.innerText.trim() ||
        "N/A";
      const comment = el.innerText.trim();

      const likeButton = thread?.querySelector("#vote-count-middle");
      const likes = likeButton?.innerText.trim() || "0";

      const replyButton = thread?.querySelector("ytd-button-renderer #text");
      let replies = "0";
      if (replyButton && replyButton.innerText.includes("repl")) {
        replies = replyButton.innerText.trim();
      }

      if (comment) {
        comments.push({ user, time, comment, likes, replies });
      }
    });

    return comments.slice(0, 50);
  } else if (url.includes("x.com")) {
    document.querySelectorAll('[data-testid="tweetText"]').forEach((el) => {
      const article = el.closest("article");
      const user =
        article?.querySelector('div[dir="ltr"] span')?.innerText.trim() ||
        "Unknown";
      const time = article?.querySelector("time")?.innerText.trim() || "N/A";
      const comment = el.innerText.trim();

      comments.push({ user, time, comment });
    });

    return comments.slice(0, 50); // ✅ ADD THIS
  } else if (url.includes("x.com")) {
    // Select all tweet articles
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');

    tweets.forEach((tweet) => {
      try {
        // USERNAME
        const userEl = tweet.querySelector(
          "div.css-1jxf684.r-bcqeeo.r-1ttztb7.r-qvutc0.r-poiln3"
        );
        const user = userEl?.innerText.trim() || "Unknown";

        // COMMENT (tweet text)
        const commentEl = tweet.querySelector(
          'div[data-testid="tweetText"], div.css-1jxf684.r-bcqeeo.r-1ttztb7.r-qvutc0.r-poiln3'
        );
        const comment = commentEl?.innerText.trim() || "N/A";

        // TIME
        const timeEl = tweet.querySelector("time");
        const time = timeEl?.innerText.trim() || "N/A";

        if (comment !== "N/A") {
          comments.push({ user, time, comment });
        }
      } catch (error) {
        console.warn("Error parsing tweet:", error);
      }
    });

    return comments.slice(0, 50);
  } else if (url.includes("facebook.com")) {
    const commentContainers = document.querySelectorAll(
      'div[aria-label*="Comment by"]'
    );

    commentContainers.forEach((container) => {
      try {
        const commentElement = container.querySelector('div[dir="auto"]');
        let comment = "";

        if (commentElement) {
          comment = Array.from(commentElement.childNodes)
            .map((node) => {
              if (node.nodeType === Node.TEXT_NODE) return node.textContent;
              else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === "IMG" && node.alt) return node.alt;
                else return node.textContent || "";
              }
              return "";
            })
            .join("")
            .trim();
        }

        const userElement =
          container.querySelector("strong span") ||
          container.querySelector('a[role="link"] span');
        const user = userElement ? userElement.textContent.trim() : "Unknown";

        const timeElement = Array.from(
          container.querySelectorAll('a[role="link"]')
        ).find((a) => /^[0-9]+[hdw]$/.test(a.textContent.trim()));
        const time = timeElement ? timeElement.textContent.trim() : "N/A";

        if (comment && comment.length > 0) {
          comments.push({ user, time, comment });
        }
      } catch (error) {
        console.log("Error processing comment:", error);
      }
    });

    return comments.slice(0, 50);
  }

  return []; // fallback to ensure something is always returned
}

chrome.runtime.onMessage.addListener((req, sender, sendRes) => {
  if (req.action === "ping") {
    sendRes({ status: "alive" });
  } else if (req.action === "getComments") {
    const comments = scrapeComments();
    sendRes({ comments });
  }
});
