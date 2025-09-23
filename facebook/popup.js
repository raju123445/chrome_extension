document.getElementById('scrape-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      function: scrapeComments,
    }, (results) => {
      const commentsContainer = document.getElementById('comments-container');
      commentsContainer.innerHTML = '';
      
      if (results && results[0] && results[0].result) {
        const comments = results[0].result;
        
        if (comments.length === 0) {
          commentsContainer.innerHTML = '<p>No comments found or not on a Facebook post page.</p>';
          return;
        }
        
        comments.forEach(comment => {
          const commentElement = document.createElement('div');
          commentElement.className = 'comment';
          commentElement.innerHTML = `
            <div class="author">${comment.author}</div>
            <div class="text">${comment.text}</div>
            <div class="timestamp">${comment.timestamp}</div>
          `;
          commentsContainer.appendChild(commentElement);
        });
      }
    });
  });
  function scrapeComments() {
    const comments = [];
    
    // Look for elements containing "Like Reply" which appears after each comment
    const potentialComments = Array.from(document.querySelectorAll('*')).filter(el => 
      el.textContent.includes('Like Reply') && 
      el.textContent.length > 20
    );
    
    potentialComments.forEach(element => {
      try {
        // Walk up the DOM to find the comment container
        let commentContainer = element;
        while (commentContainer && !commentContainer.querySelector('[role="article"]')) {
          commentContainer = commentContainer.parentElement;
          if (!commentContainer) break;
        }
        
        if (commentContainer) {
          const author = commentContainer.querySelector('a[role="link"]')?.textContent || 'Unknown';
          const text = commentContainer.querySelector('div[dir="auto"]')?.textContent || '';
          const timestamp = element.querySelector('a[aria-label]')?.getAttribute('aria-label') || '';
          
          if (text) {
            comments.push({
              author,
              text,
              timestamp
            });
          }
        }
      } catch (e) {
        console.error('Error parsing comment:', e);
      }
    });
    
    return comments;
  }