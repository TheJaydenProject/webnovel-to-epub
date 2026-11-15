// Load the actual dashboard with mocked extension APIs. No live site access.
const html = await (await fetch("../ui/main.html", { cache: "no-store" })).text();
const fresh = Date.now();
document.open();
document.write(html.replace("<head>", '<head><base href="/ui/"><script src="/tests/gallery-dashboard-mock.js"></script>')
  .replace('src="main.js"', `src="main.js?check=${fresh}"`).replace('href="main.css"', `href="main.css?check=${fresh}"`));
document.close();
