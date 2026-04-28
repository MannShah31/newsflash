# NewsFlash — Real-Time Indian Market News Aggregator

A Bloomberg-terminal-inspired live news dashboard that aggregates financial news from 9 sources with WebSocket push delivery. New articles appear **instantly** without polling delays on the client.

## Sources

| Source | Type | Category |
|---|---|---|
| MoneyControl | RSS | Finance |
| Economic Times Markets | RSS | Markets |
| Economic Times Breaking | RSS | Breaking |
| LiveMint | RSS | Finance |
| Business Standard | RSS | Finance |
| Hindu BusinessLine | RSS | Finance |
| NDTV Profit | RSS | Markets |
| Zee Business | RSS | Markets |
| Inshorts | API | Brief |

## Architecture

```
[RSS Feeds] ──┐
              ├──> Node.js Polling (every 30s) ──> WebSocket Push ──> Browser
[Inshorts API]┘
```

- **Backend**: Express + `ws` WebSocket server + `rss-parser`
- **Frontend**: Vanilla JS, no framework, connects via WebSocket
- **Latency**: ~0ms on client (push delivery), ~30s server-side polling window
- **Deduplication**: URL-based, articles never repeat

## Setup

### Prerequisites
- Node.js 18+
- npm

### Install & Run

```bash
# Install dependencies
npm install

# Start (production)
npm start

# Start (development, auto-restarts on file change)
npm run dev
```

Open **http://localhost:3000** in your browser.

## Features

- **WebSocket push** — new articles pushed to all clients instantly, no client-side polling
- **Live ticker strip** — scrolling headline bar showing latest 30 articles
- **Source filters** — filter by source or category (Breaking / Markets / Finance / Brief)
- **Live indicators** — green dot per source shows feed health in real-time
- **Toast notifications** — popup when new articles arrive
- **Flash bar** — green progress bar flashes on new content
- **REST API** — fallback HTTP endpoints for article data
- **Auto-reconnect** — WebSocket reconnects automatically if connection drops

## REST API

```
GET /api/articles          — All articles (latest 50)
GET /api/articles?source=moneycontrol  — Filter by source
GET /api/articles?category=markets     — Filter by category
GET /api/articles?limit=100            — Custom limit
GET /api/stats             — Server stats (sources, counts, connections)
GET /api/refresh           — Manually trigger a fetch cycle
```

## Deployment (optional)

### Deploy on Railway / Render / Fly.io
1. Push to a GitHub repo
2. Connect to Railway/Render
3. Set `PORT` environment variable (handled automatically on most platforms)
4. Deploy

### Environment Variables
| Variable | Default | Description |
|---|---|---|
| PORT | 3000 | Server port |

## Customising

### Add a new RSS source
In `server.js`, add to the `RSS_SOURCES` array:
```js
{
  id: 'my_source',
  name: 'My Source',
  color: '#FF5733',
  category: 'markets',      // breaking | markets | finance | brief
  url: 'https://example.com/feed.rss',
}
```

### Change poll interval
In `server.js`, find:
```js
setInterval(pollAll, 30 * 1000);
```
Change `30 * 1000` to any millisecond value (minimum recommended: 15000).

## Troubleshooting

- **Inshorts shows as down**: Their API blocks non-browser requests intermittently. This is expected — the other 8 sources continue working.
- **Some RSS feeds fail**: RSS URLs can change. Check the source's website for their current RSS URL and update `server.js`.
- **Port already in use**: Set `PORT=3001 npm start` to use a different port.
