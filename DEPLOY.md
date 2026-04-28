# NewsFlash — Deploy to Railway (Free)

## What you'll get
- Live public URL (e.g. `newsflash-production.up.railway.app`)
- Installable PWA on Android & iPhone
- Push notifications for breaking news
- Always-on (no sleeping like Render free tier)

---

## Step 1 — Put code on GitHub (one time)

1. Go to https://github.com and create a free account if you don't have one
2. Click **+** → **New repository** → name it `newsflash` → **Create**
3. On your computer, open terminal in the `newsflash` folder and run:

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/newsflash.git
git push -u origin main
```
Replace `YOUR_USERNAME` with your GitHub username.

---

## Step 2 — Deploy on Railway (free)

1. Go to https://railway.app and sign up with your GitHub account
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `newsflash` repository
4. Railway auto-detects Node.js and deploys it
5. Click **Settings** → **Networking** → **Generate Domain**
6. You'll get a URL like `newsflash-production.up.railway.app` ✅

**Free tier gives you $5 credit/month** — enough to run 24/7 for the whole month.

---

## Step 3 — Install as PWA on your phone

### Android (Chrome)
1. Open your Railway URL in Chrome
2. Tap the **⋮ menu** → **Add to Home screen**
3. Or tap the **Install** banner that appears automatically

### iPhone (Safari)
1. Open your Railway URL in Safari
2. Tap the **Share** button (box with arrow)
3. Scroll down → **Add to Home Screen**
4. Tap **Add**

---

## Step 4 — Enable notifications (optional)

1. Open the app
2. Tap **🔔 Alerts** in the top bar
3. Tap **Allow** when browser asks for permission
4. You'll get notified whenever a breaking news article arrives

---

## Updating the app

Whenever you change code locally:
```bash
git add .
git commit -m "update"
git push
```
Railway auto-redeploys in ~30 seconds. No downtime.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Railway says "No start command" | Make sure `Procfile` is in root folder |
| App crashes on Railway | Check logs in Railway dashboard → Deployments |
| PWA won't install on iPhone | Must use Safari (not Chrome) on iOS |
| Notifications not working | Must be on HTTPS (Railway gives this automatically) |
