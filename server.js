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
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  },
});

app.use(express.static(path.join(__dirname, "public")));

// ─── Sources ──────────────────────────────────────────────────────────────────
// Each entry has fallback URLs tried in order — first success wins
const SOURCES = [
  {
    id: "et_default",   name: "Economic Times", color: "#F59E0B", category: "breaking",
    urls: ["https://economictimes.indiatimes.com/rssfeedsdefault.cms"],
  },
  {
    id: "et_markets",   name: "ET Markets",     color: "#EF4444", category: "markets",
    urls: ["https://economictimes.indiatimes.com/markets/stocks/rss.cms",
           "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"],
  },
  {
    id: "et_economy",   name: "ET Economy",     color: "#F97316", category: "finance",
    urls: ["https://economictimes.indiatimes.com/economy/rssfeeds/1373380680.cms"],
  },
  {
    id: "livemint",     name: "LiveMint",        color: "#10B981", category: "finance",
    urls: ["https://www.livemint.com/rss/news"],
  },
  {
    id: "hindu_bizline",name: "Hindu BizLine",   color: "#EC4899", category: "finance",
    urls: ["https://www.thehindubusinessline.com/news/feeder/default.rss",
           "https://www.thehindubusinessline.com/markets/feeder/default.rss"],
  },
  {
    id: "ndtv_profit",  name: "NDTV Profit",     color: "#3B82F6", category: "markets",
    urls: ["https://feeds.feedburner.com/ndtvprofit-latest"],
  },
  {
    id: "the_hindu_biz",name: "The Hindu Biz",   color: "#8B5CF6", category: "finance",
    urls: ["https://www.thehindu.com/business/feeder/default.rss"],
  },
  {
    id: "yahoo_finance",name: "Yahoo Finance",   color: "#06B6D4", category: "markets",
    urls: ["https://finance.yahoo.com/rss/topfinstories",
           "https://finance.yahoo.com/news/rssindex"],
  },
  {
    id: "cnbc_finance", name: "CNBC Finance",    color: "#22C55E", category: "markets",
    urls: ["https://www.cnbc.com/id/10000664/device/rss/rss.html",
           "https://www.cnbc.com/id/100003114/device/rss/rss.html"],
  },
  // Google News RSS — aggregates ALL Indian outlets, most reliable for servers
  {
    id: "gnews_markets",  name: "Markets (GN)",   color: "#A855F7", category: "markets",
    urls: ["https://news.google.com/rss/search?q=sensex+nifty+BSE+NSE&hl=en-IN&gl=IN&ceid=IN:en"],
  },
  {
    id: "gnews_economy",  name: "Economy (GN)",   color: "#14B8A6", category: "finance",
    urls: ["https://news.google.com/rss/search?q=india+economy+RBI+budget&hl=en-IN&gl=IN&ceid=IN:en"],
  },
  {
    id: "gnews_breaking", name: "Breaking (GN)",  color: "#F43F5E", category: "breaking",
    urls: ["https://news.google.com/rss/search?q=india+business+breaking+news&hl=en-IN&gl=IN&ceid=IN:en"],
  },
  {
    id: "gnews_ipo",      name: "IPO & Stocks (GN)",color: "#FB923C", category: "markets",
    urls: ["https://news.google.com/rss/search?q=IPO+india+stocks+shares&hl=en-IN&gl=IN&ceid=IN:en"],
  },
  {
    id: "gnews_commodities", name: "Commodities (GN)", color: "#84CC16", category: "markets",
    urls: ["https://news.google.com/rss/search?q=crude+oil+gold+silver+india+price&hl=en-IN&gl=IN&ceid=IN:en"],
  },
  {
    id: "gnews_forex",    name: "Forex (GN)",     color: "#F59E0B", category: "markets",
    urls: ["https://news.google.com/rss/search?q=rupee+dollar+forex+india&hl=en-IN&gl=IN&ceid=IN:en"],
  },
];

// ─── State ────────────────────────────────────────────────────────────────────
let articleStore = new Map();
let sourceStatus = {};
let totalBroadcast = 0;

SOURCES.forEach((s) => {
  sourceStatus[s.id] = { ok: null, lastFetch: null, count: 0, name: s.name, color: s.color };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const stripHtml = (h = "") => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function normalizeDate(str) {
  const d = new Date(str);
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

// ─── Fetch with fallbacks ─────────────────────────────────────────────────────
async function fetchSource(source) {
  for (const url of source.urls) {
    try {
      const feed = await parser.parseURL(url);
      const fresh = [];

      (feed.items || []).slice(0, 20).forEach((item) => {
        const key = item.link || item.guid || "";
        if (!key || articleStore.has(key)) return;
        articleStore.set(key, {
          id:          Buffer.from(key).toString("base64").slice(0, 16),
          url:         key,
          title:       (item.title || "").trim(),
          description: stripHtml(item.contentSnippet || item.content || item.description || "").slice(0, 220),
          publishedAt: normalizeDate(item.pubDate || item.isoDate),
          source:      source.id,
          sourceName:  source.name,
          sourceColor: source.color,
          category:    source.category,
          fetchedAt:   new Date().toISOString(),
          isNew:       true,
        });
        fresh.push(articleStore.get(key));
      });

      sourceStatus[source.id] = { ...sourceStatus[source.id], ok: true, lastFetch: new Date().toISOString(), count: (sourceStatus[source.id].count || 0) + fresh.length };
      return fresh;
    } catch (_) { /* try next URL */ }
  }

  sourceStatus[source.id] = { ...sourceStatus[source.id], ok: false, lastFetch: new Date().toISOString() };
  return [];
}

// ─── Poll Loop ────────────────────────────────────────────────────────────────
async function pollAll() {
  const results = await Promise.all(SOURCES.map(fetchSource));
  const allNew  = results.flat().sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  if (allNew.length) {
    totalBroadcast += allNew.length;
    broadcast({ type: "NEW_ARTICLES", articles: allNew, stats: getStats() });
  }

  // Expire isNew after 5 min
  articleStore.forEach((a, k) => {
    if (a.isNew && Date.now() - new Date(a.fetchedAt).getTime() > 5 * 60000)
      articleStore.set(k, { ...a, isNew: false });
  });

  // Cap store at 800
  if (articleStore.size > 800) {
    const sorted = [...articleStore.entries()].sort((a, b) => new Date(b[1].publishedAt) - new Date(a[1].publishedAt));
    articleStore = new Map(sorted.slice(0, 800));
  }

  broadcast({ type: "STATUS", stats: getStats() });

  const live = Object.values(sourceStatus).filter((s) => s.ok).length;
  console.log(`[${new Date().toLocaleTimeString()}] +${allNew.length} new | ${live}/${SOURCES.length} sources | ${articleStore.size} stored | ${wss.clients.size} clients`);
}

function getStats() {
  const arts = [...articleStore.values()], now = Date.now();
  return {
    total:          arts.length,
    last5min:       arts.filter((a) => now - new Date(a.publishedAt) < 5  * 60000).length,
    last1hr:        arts.filter((a) => now - new Date(a.publishedAt) < 60 * 60000).length,
    sources:        sourceStatus,
    connectedClients: wss.clients.size,
    totalBroadcast,
    serverTime:     new Date().toISOString(),
  };
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
wss.on("connection", (ws) => {
  console.log(`[WS] +1 client (${wss.clients.size} total)`);

  ws.send(JSON.stringify({
    type: "SNAPSHOT",
    articles: [...articleStore.values()].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)),
    stats: getStats(),
  }));

  ws.on("message", (msg) => {
    try { const d = JSON.parse(msg); if (d.type === "PING") ws.send(JSON.stringify({ type: "PONG" })); }
    catch (_) {}
  });

  ws.on("close", () => console.log(`[WS] -1 client (${wss.clients.size} total)`));
  ws.on("error", () => {});
});

// ─── REST API ─────────────────────────────────────────────────────────────────
app.get("/api/articles", (req, res) => {
  let list = [...articleStore.values()].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  if (req.query.source)   list = list.filter((a) => a.source   === req.query.source);
  if (req.query.category) list = list.filter((a) => a.category === req.query.category);
  res.json({ articles: list.slice(0, +req.query.limit || 100), stats: getStats() });
});

app.get("/api/stats",   (_, res) => res.json(getStats()));
app.get("/api/refresh", async (_, res) => { res.json({ ok: true }); await pollAll(); });

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`\n🚀  http://localhost:${PORT}`);
  console.log(`📡  ws://localhost:${PORT}\n`);
  await pollAll();
  setInterval(pollAll, 30 * 1000);
});
