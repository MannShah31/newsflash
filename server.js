const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const RSSParser = require("rss-parser");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const parser = new RSSParser({
  timeout: 12000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  },
});

app.use(express.static(path.join(__dirname, "public")));

// ─── Sources ──────────────────────────────────────────────────────────────────
const SOURCES = [
  {
    id: "et_default",
    name: "Economic Times",
    color: "#F59E0B",
    category: "breaking",
    urls: ["https://economictimes.indiatimes.com/rssfeedsdefault.cms"],
  },
  {
    id: "et_markets",
    name: "ET Markets",
    color: "#EF4444",
    category: "markets",
    urls: [
      "https://economictimes.indiatimes.com/markets/stocks/rss.cms",
      "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    ],
  },
  {
    id: "livemint",
    name: "LiveMint",
    color: "#10B981",
    category: "finance",
    urls: ["https://www.livemint.com/rss/news"],
  },
  {
    id: "hindu_bizline",
    name: "Hindu BizLine",
    color: "#EC4899",
    category: "finance",
    urls: ["https://www.thehindubusinessline.com/news/feeder/default.rss"],
  },
  {
    id: "gnews_markets",
    name: "Markets (GN)",
    color: "#A855F7",
    category: "markets",
    urls: [
      "https://news.google.com/rss/search?q=sensex+nifty+BSE+NSE&hl=en-IN&gl=IN&ceid=IN:en",
    ],
  },
  {
    id: "gnews_economy",
    name: "Economy (GN)",
    color: "#14B8A6",
    category: "finance",
    urls: [
      "https://news.google.com/rss/search?q=india+economy+RBI+budget&hl=en-IN&gl=IN&ceid=IN:en",
    ],
  },
];

// ─── State ────────────────────────────────────────────────────────────────────
let articleStore = new Map();
let sourceStatus = {};
let totalBroadcast = 0;

SOURCES.forEach((s) => {
  sourceStatus[s.id] = {
    ok: null,
    lastFetch: null,
    count: 0,
    name: s.name,
    color: s.color,
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const stripHtml = (h = "") =>
  h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function normalizeDate(str) {
  const d = new Date(str);
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

// ─── Fetch with fixes ─────────────────────────────────────────────────────────
async function fetchSource(source) {
  for (const url of source.urls) {
    try {
      const feed = await parser.parseURL(url);
      const fresh = [];

      (feed.items || []).slice(0, 20).forEach((item) => {
        let link = item.link || item.guid || "";

        // 🔥 FIX: Google News redirect issue
        if (link.includes("news.google.com")) {
          try {
            const urlObj = new URL(link);
            const realUrl = urlObj.searchParams.get("url");
            if (realUrl) {
              link = decodeURIComponent(realUrl);
            } else {
              return; // skip bad google links
            }
          } catch {
            return;
          }
        }

        // Skip invalid links
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
          ).slice(0, 220),
          publishedAt: normalizeDate(item.pubDate || item.isoDate),
          source: source.id,
          sourceName: source.name,
          sourceColor: source.color,
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
        count:
          (sourceStatus[source.id].count || 0) + fresh.length,
      };

      return fresh;
    } catch (err) {
      console.log(`❌ Failed: ${source.name} - ${url}`, err.message);
    }
  }

  sourceStatus[source.id] = {
    ...sourceStatus[source.id],
    ok: false,
    lastFetch: new Date().toISOString(),
  };

  return [];
}

// ─── Poll Loop ────────────────────────────────────────────────────────────────
async function pollAll() {
  const results = await Promise.all(SOURCES.map(fetchSource));
  const allNew = results
    .flat()
    .sort(
      (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
    );

  if (allNew.length) {
    totalBroadcast += allNew.length;
    broadcast({
      type: "NEW_ARTICLES",
      articles: allNew,
      stats: getStats(),
    });
  }

  // Expire "new"
  articleStore.forEach((a, k) => {
    if (
      a.isNew &&
      Date.now() - new Date(a.fetchedAt).getTime() >
        5 * 60000
    ) {
      articleStore.set(k, { ...a, isNew: false });
    }
  });

  broadcast({ type: "STATUS", stats: getStats() });
}

function getStats() {
  const arts = [...articleStore.values()];
  const now = Date.now();

  return {
    total: arts.length,
    last5min: arts.filter(
      (a) =>
        now - new Date(a.publishedAt) < 5 * 60000
    ).length,
    last1hr: arts.filter(
      (a) =>
        now - new Date(a.publishedAt) < 60 * 60000
    ).length,
    sources: sourceStatus,
    connectedClients: wss.clients.size,
    totalBroadcast,
    serverTime: new Date().toISOString(),
  };
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
wss.on("connection", (ws) => {
  ws.send(
    JSON.stringify({
      type: "SNAPSHOT",
      articles: [...articleStore.values()],
      stats: getStats(),
    })
  );
});

// ─── REST ─────────────────────────────────────────────────────────────────────
app.get("/api/articles", (req, res) => {
  res.json({
    articles: [...articleStore.values()].slice(0, 100),
    stats: getStats(),
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
  console.log(`🚀 Server running on ${PORT}`);
  await pollAll();
  setInterval(pollAll, 30000);
});
