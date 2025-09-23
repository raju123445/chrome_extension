// function scrapeComments() {
//   const url = window.location.href;
//   const comments = [];

//   if (url.includes("youtube.com")) {
//     document.querySelectorAll("#content-text").forEach((el) => {
//       const thread = el.closest("ytd-comment-thread-renderer");
//       const user =
//         thread?.querySelector("#author-text span")?.innerText.trim() ||
//         "Unknown";
//       const time =
//         thread?.querySelector("#published-time-text a")?.innerText.trim() ||
//         "N/A";
//       const comment = el.innerText.trim();

//       // Get like count
//       const likeButton = thread?.querySelector("#vote-count-middle");
//       const likes = likeButton?.innerText.trim() || "0";

//       // Get reply count
//       const replyButton = thread?.querySelector("ytd-button-renderer #text");
//       let replies = "0";
//       if (replyButton && replyButton.innerText.includes("repl")) {
//         replies = replyButton.innerText.trim(); // e.g., "26 replies"
//       }

//       if (comment) {
//         comments.push({ user, time, comment, likes, replies });
//       }
//     });
// return comments.slice(0, 50);
    
//   } else if (url.includes("x.com")) {
//     document.querySelectorAll('[data-testid="tweetText"]').forEach((el) => {
//       const article = el.closest("article");
//       const user = article
//         ?.querySelector('div[dir="ltr"] span')
//         ?.innerText.trim();
//       const time = article?.querySelector("time")?.innerText.trim() || "N/A";
//       const comment = el.innerText.trim();

//       comments.push({ user, time, comment });
//     });
    
//   } 

// else if (url.includes("instagram.com")) {
//   const commentBlocks = document.querySelectorAll('div.x1lliihq.x1plvlek'); // flexible block matching

//   if (!commentBlocks.length) {
//     console.warn("No comment blocks found.");
//   }

//   commentBlocks.forEach((el) => {
//     try {
//       // Username
//       const userAnchor = el.querySelector('a[role="link"][href^="/"]');
//       const username = userAnchor?.innerText.trim() || "N/A";

//       // Comment (your target span)
//       const spanCandidates = el.querySelectorAll('span');
//       let comment = "N/A";
//       for (const span of spanCandidates) {
//         const text = span.innerText?.trim();
//         if (
//           text &&
//           text !== username &&
//           !text.match(/^\d+\s+likes$/i)
//         ) {
//           comment = text;
//           break;
//         }
//       }

//       // Time
//       const timeEl = el.querySelector('time');
//       const time = timeEl?.getAttribute("title") || "N/A";

//       // Likes
//       const likeSpan = [...el.querySelectorAll("span")].find(span =>
//         span.innerText.trim().match(/^\d+\s+likes$/)
//       );
//       const likes = likeSpan?.innerText.trim() || "0 likes";

//       if (username !== "N/A" && comment !== "N/A") {
//         comments.push({
//           user: username,
//           comment: comment,
//           time: time,
//           likes: likes,
//         });
//       }
//     } catch (err) {
//       console.warn("Error parsing a comment:", err);
//     }
//   });
// }




  
//   else if (url.includes("facebook.com")) {
//     if (url.includes("facebook.com")) {
//       const commentContainers = document.querySelectorAll(
//         'div[aria-label*="Comment by"]'
//       );

//       commentContainers.forEach((container) => {
//         try {
//           // ✅ Fetch full comment with emojis and text
//           const commentElement = container.querySelector('div[dir="auto"]');
//           let comment = "";

//           if (commentElement) {
//             comment = Array.from(commentElement.childNodes)
//               .map((node) => {
//                 if (node.nodeType === Node.TEXT_NODE) {
//                   return node.textContent;
//                 } else if (node.nodeType === Node.ELEMENT_NODE) {
//                   // Check if it's an emoji image
//                   if (node.tagName === "IMG" && node.alt) {
//                     return node.alt; // ← This gives you the emoji symbol like "👍"
//                   } else {
//                     return node.textContent || ""; // fallback for any other HTML
//                   }
//                 } else {
//                   return "";
//                 }
//               })
//               .join("")
//               .trim();
//           }
//           // ✅ Ensure comment is not empty
//           // ✅ Username
//           const userElement =
//             container.querySelector("strong span") ||
//             container.querySelector('a[role="link"] span');
//           const user = userElement ? userElement.textContent.trim() : "Unknown";

//           // ✅ Timestamp (fixed with textContent)
//           const timeElement = Array.from(
//             container.querySelectorAll('a[role="link"]')
//           ).find((a) => /^[0-9]+[hdw]$/.test(a.textContent.trim()));
//           const time = timeElement ? timeElement.textContent.trim() : "N/A";

//           // ✅ Only push if comment is present
//           if (comment && comment.length > 0) {
//             comments.push({ user, time, comment });
//           }
//         } catch (error) {
//           console.log("Error processing comment:", error);
//         }
//       });
//     }

//     return comments.slice(0, 50);
//   }
// }


// chrome.runtime.onMessage.addListener((req, sender, sendRes) => {
//   if (req.action === "ping") {
//     sendRes({ status: "alive" });
//   } else if (req.action === "getComments") {
//     const comments = scrapeComments();
//     sendRes({ comments });
//   }
// });

function scrapeComments() {
  const url = window.location.href;
  const comments = [];

  if (url.includes("youtube.com")) {
    document.querySelectorAll("#content-text").forEach((el) => {
      const thread = el.closest("ytd-comment-thread-renderer");
      const user =
        thread?.querySelector("#author-text span")?.innerText.trim() || "Unknown";
      const time =
        thread?.querySelector("#published-time-text a")?.innerText.trim() || "N/A";
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
  } 
  
  else if (url.includes("x.com")) {
    document.querySelectorAll('[data-testid="tweetText"]').forEach((el) => {
      const article = el.closest("article");
      const user = article?.querySelector('div[dir="ltr"] span')?.innerText.trim() || "Unknown";
      const time = article?.querySelector("time")?.innerText.trim() || "N/A";
      const comment = el.innerText.trim();

      comments.push({ user, time, comment });
    });

    return comments.slice(0, 50); // ✅ ADD THIS
  } 
  
  else if (url.includes("instagram.com")) {
    const commentBlocks = document.querySelectorAll('div.x1lliihq.x1plvlek');

    if (!commentBlocks.length) {
      console.warn("No comment blocks found.");
    }

    commentBlocks.forEach((el) => {
      try {
        const userAnchor = el.querySelector('a[role="link"][href^="/"]');
        const username = userAnchor?.innerText.trim() || "N/A";

        const spanCandidates = el.querySelectorAll('span');
        let comment = "N/A";
        for (const span of spanCandidates) {
          const text = span.innerText?.trim();
          if (text && text !== username && !text.match(/^\d+\s+likes$/i)) {
            comment = text;
            break;
          }
        }

        const timeEl = el.querySelector('time');
        const time = timeEl?.getAttribute("title") || "N/A";

        const likeSpan = [...el.querySelectorAll("span")].find(span =>
          span.innerText.trim().match(/^\d+\s+likes$/)
        );
        const likes = likeSpan?.innerText.trim() || "0 likes";

        if (username !== "N/A" && comment !== "N/A") {
          comments.push({ user: username, comment, time, likes });
        }
      } catch (err) {
        console.warn("Error parsing a comment:", err);
      }
    });

    return comments.slice(0, 50); // ✅ ADD THIS
  } 
  
  else if (url.includes("facebook.com")) {
    const commentContainers = document.querySelectorAll('div[aria-label*="Comment by"]');

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
