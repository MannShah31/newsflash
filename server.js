const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const RSSParser = require("rss-parser");
const path = require("path");
const fetch = require("node-fetch");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const parser = new RSSParser({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/rss+xml, application/xml, text/xml",
  },
});

app.use(express.static(path.join(__dirname, "public")));


// ─────────────────────────────────────────────────────────
// ✅ CLEAN + RELIABLE SOURCES ONLY
// ─────────────────────────────────────────────────────────
const SOURCES = [
  {
    id: "et",
    name: "Economic Times",
    category: "breaking",
    urls: ["https://economictimes.indiatimes.com/rssfeedsdefault.cms"],
  },
  {
    id: "mint",
    name: "LiveMint",
    category: "finance",
    urls: ["https://www.livemint.com/rss/news"],
  },
  {
    id: "hindu",
    name: "Hindu BusinessLine",
    category: "finance",
    urls: ["https://www.thehindubusinessline.com/news/feeder/default.rss"],
  },

  // Google News (SAFE after fix)
  {
    id: "g_markets",
    name: "Markets",
    category: "markets",
    urls: [
      "https://news.google.com/rss/search?q=sensex+nifty+india&hl=en-IN&gl=IN&ceid=IN:en",
    ],
  },
  {
    id: "g_economy",
    name: "Economy",
    category: "finance",
    urls: [
      "https://news.google.com/rss/search?q=india+economy+RBI&hl=en-IN&gl=IN&ceid=IN:en",
    ],
  },
  {
    id: "g_breaking",
    name: "Breaking",
    category: "breaking",
    urls: [
      "https://news.google.com/rss/search?q=india+business+news&hl=en-IN&gl=IN&ceid=IN:en",
    ],
  },
];


// ─────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────
let articleStore = new Map();
let sourceStatus = {};
let totalBroadcast = 0;

SOURCES.forEach((s) => {
  sourceStatus[s.id] = {
    ok: null,
    lastFetch: null,
    count: 0,
    name: s.name,
  };
});


// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────
const stripHtml = (h = "") =>
  h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const normalizeDate = (d) => {
  const date = new Date(d);
  return isNaN(date) ? new Date().toISOString() : date.toISOString();
};

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}


// ─────────────────────────────────────────────────────────
// 🔥 CORE FIXED FETCH FUNCTION
// ─────────────────────────────────────────────────────────
async function fetchSource(source) {
  for (const url of source.urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      const text = await res.text();

      // 🚨 Skip if HTML (not RSS)
      if (text.includes("<html")) {
        console.log(`⚠️ Skipped HTML (blocked): ${source.name}`);
        continue;
      }

      const feed = await parser.parseString(text);
      const fresh = [];

      (feed.items || []).slice(0, 20).forEach((item) => {
        let link = item.link || item.guid || "";

        // 🔥 FIX GOOGLE NEWS LINKS
        if (link.includes("news.google.com")) {
          try {
            const urlObj = new URL(link);
            const real = urlObj.searchParams.get("url");
            if (real) link = decodeURIComponent(real);
            else return;
          } catch {
            return;
          }
        }

        // 🚫 Skip bad links
        if (!link || !link.startsWith("http")) return;

        if (articleStore.has(link)) return;

        articleStore.set(link, {
          id: Buffer.from(link).toString("base64").slice(0, 16),
          url: link,
          title: (item.title || "").trim(),
          description: stripHtml(
            item.contentSnippet ||
            item.summary ||
            item.content ||
            item.description ||
            ""
          ).slice(0, 200),
          publishedAt: normalizeDate(item.pubDate || item.isoDate),
          source: source.id,
          sourceName: source.name,
          category: source.category,
          fetchedAt: new Date().toISOString(),
          isNew: true,
        });

        fresh.push(articleStore.get(link));
      });

      sourceStatus[source.id] = {
        ...sourceStatus[source.id],
        ok: true,
        lastFetch: new Date().toISOString(),
        count: sourceStatus[source.id].count + fresh.length,
      };

      return fresh;

    } catch (err) {
      console.log(`❌ Failed: ${source.name}`, err.message);
    }
  }

  sourceStatus[source.id].ok = false;
  return [];
}


// ─────────────────────────────────────────────────────────
// POLLING
// ─────────────────────────────────────────────────────────
async function pollAll() {
  const results = await Promise.all(SOURCES.map(fetchSource));
  const allNew = results.flat();

  if (allNew.length) {
    totalBroadcast += allNew.length;
    broadcast({
      type: "NEW_ARTICLES",
      articles: allNew,
      stats: getStats(),
    });
  }
}


// ─────────────────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────────────────
function getStats() {
  return {
    total: articleStore.size,
    sources: sourceStatus,
    clients: wss.clients.size,
    totalBroadcast,
  };
}


// ─────────────────────────────────────────────────────────
// WEBSOCKET
// ─────────────────────────────────────────────────────────
wss.on("connection", (ws) => {
  ws.send(
    JSON.stringify({
      type: "SNAPSHOT",
      articles: [...articleStore.values()],
      stats: getStats(),
    })
  );
});


// ─────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────
app.get("/api/articles", (req, res) => {
  res.json({
    articles: [...articleStore.values()].slice(0, 100),
    stats: getStats(),
  });
});


// ─────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
  console.log(`🚀 Running on port ${PORT}`);
  await pollAll();
  setInterval(pollAll, 30000);
});
