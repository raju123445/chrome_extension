chrome.action.onClicked.addListener(async () => {
  // Open popup window
  chrome.windows.create({
    url: chrome.runtime.getURL("popup.html") + "#standalone",
    type: "popup",
    width: 420,
    height: 600,
  });
});
