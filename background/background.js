// The toolbar button opens a new dashboard tab, passing along the current
// page URL so the user doesn't have to retype it. Each tab runs fully
// independently, so multiple novels (even from different sites) can be
// loaded/compiled concurrently in separate tabs.
browser.action.onClicked.addListener(async (tab) => {
  const uiUrl = browser.runtime.getURL("ui/main.html");

  let targetUrl = uiUrl;
  if (tab?.url) {
    targetUrl += `?url=${encodeURIComponent(tab.url)}`;
  }
  await browser.tabs.create({ url: targetUrl });
});
