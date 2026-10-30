# Discord Jobs + DSA Bots

Two independent Discord bots that share one small codebase:

| Bot | What it does |
| --- | --- |
| **Jobs bot** (`npm run jobs`) | Pulls listings from **your existing Apify actor**, sorts each one into **frontend / backend / fullstack**, extracts HR/recruiter emails, de-duplicates, and posts a rich embed in the matching channel. |
| **DSA bot** (`npm run dsa`) | Runs a personal daily DSA question for **every enrolled member** in their own Discord thread, with hints, streaks, adaptive difficulty, spaced-repetition reviews and a leaderboard. |

Both are plain Node.js processes: no native modules, no database server, no build step. Storage is SQLite through Node's built-in `node:sqlite` driver.

---

## 1. Quick start

Requirements: **Node.js 22.5+** (you have 24.x) and two Discord applications.

### 1.1 Create the two bots

1. Go to <https://discord.com/developers/applications> → **New Application** → name it `Jobs`.
2. **Bot** tab → **Reset Token** → copy the token (`JOBS_DISCORD_TOKEN`).
3. **General Information** tab → copy **Application ID** (`JOBS_CLIENT_ID`).
4. Repeat for a second app called `DSA` → `DSA_DISCORD_TOKEN`, `DSA_CLIENT_ID`.

No privileged intents are needed — both bots only use the `Guilds` intent.

### 1.2 Invite them

Open these URLs with your own IDs (replace `APP_ID`):

```
Jobs: https://discord.com/oauth2/authorize?client_id=APP_ID&scope=bot%20applications.commands&permissions=93184
DSA : https://discord.com/oauth2/authorize?client_id=APP_ID&scope=bot%20applications.commands&permissions=326417599488
```

What those numbers mean:

* Jobs `93184` — View Channels, Send Messages, Embed Links, Read Message History, Manage Messages (for the *Not relevant* button).
* DSA `326417599488` — the above chat basics plus Create Public Threads, Send Messages in Threads, Manage Threads.

If you prefer one single bot application for both, use permissions `326417607680` and set the same token/ID under both `JOBS_*` and `DSA_*` (still run two processes so a scrape never blocks a daily send).

### 1.3 Configure

```powershell
cd E:\bots
Copy-Item .env.example .env
```

Fill in `.env`. The minimum for jobs:

```ini
JOBS_DISCORD_TOKEN=...
JOBS_CLIENT_ID=...
JOBS_CHANNEL_FRONTEND=123456789012345678
JOBS_CHANNEL_BACKEND=123456789012345678
JOBS_CHANNEL_FULLSTACK=123456789012345678
APIFY_TOKEN=apify_api_...
APIFY_ACTOR_ID=yourname~your-actor
APIFY_INPUT_JSON={"location":"India","maxItems":100}
```

The minimum for DSA:

```ini
DSA_DISCORD_TOKEN=...
DSA_CLIENT_ID=...
DSA_CHANNEL_ID=123456789012345678
DSA_TIMEZONE=Asia/Kolkata
DSA_HOUR=9
```

To get channel IDs: Discord **User Settings → Advanced → Developer Mode → on**, then right-click a channel → **Copy Channel ID**.

### 1.4 Install, register commands, run

```powershell
npm install
npm run doctor        # verifies tokens, actor, channels and prints invite URLs
npm run deploy        # registers slash commands (instant if GUILD_ID is set)
npm run jobs          # terminal 1
npm run dsa           # terminal 2
```

If you set `GUILD_ID` in `.env`, commands are also re-registered automatically on every startup, so `npm run deploy` is optional. Without `GUILD_ID`, global commands can take up to an hour to appear the first time.

Check everything works:

```powershell
npm test              # 52 offline tests: classification, email extraction, dedupe, scheduling, picking
```

---

## 2. Jobs bot

### 2.1 What a post looks like

Each post is an embed with the role title linked to the original listing, company, location, compensation, stack tags, a copyable **HR email** field when one was found, an **Apply now** link button and a **Not relevant** button (moderators only) that deletes the post and suppresses the job permanently.

### 2.2 Apify setup

The adapter calls Apify's synchronous dataset endpoint:

```
POST https://api.apify.com/v2/acts/{ACTOR}/run-sync-get-dataset-items
```

so it works with **any** actor that returns an array of items. Three things to configure:

| Variable | Meaning |
| --- | --- |
| `APIFY_TOKEN` | Account API token (Apify → Settings → Integrations). |
| `APIFY_ACTOR_ID` | `username~actor-name` or `username/actor-name`. |
| `APIFY_INPUT_JSON` | The exact input your actor expects, as JSON. |
| `APIFY_MAX_ITEMS` | How many dataset items to request (default 100). |

Field names in your dataset rarely match ours, so the normaliser accepts **candidate paths** per field. Defaults cover the common shapes:

```ini
# Only override what differs from the defaults.
APIFY_MAP_TITLE=jobTitle,title
APIFY_MAP_COMPANY=companyName,employer
APIFY_MAP_URL=jobUrl,applyUrl
APIFY_MAP_DESCRIPTION=descriptionHtml,jobDescription
APIFY_MAP_LOCATION=location,city
APIFY_MAP_SALARY=salary,compensation
APIFY_MAP_POSTED_AT=postedAt,createdAt
APIFY_MAP_EMAILS=emails,contactEmails
APIFY_MAP_TAGS=tags,skills
APIFY_MAP_SOURCE=source,board
```

Dot paths work too (`employer.name`, `location.0.name`). Objects like `{min,max,currency}` are turned into a readable salary string, HTML is stripped, epoch seconds are parsed, and `undefined` never reaches the database.

**Tip:** if the actor needs more than ~5 minutes, drop `APIFY_TIMEOUT_SECS` risk by lowering `APIFY_INPUT_JSON.maxItems`, or run the actor on an Apify schedule and point this bot at that dataset instead. `run-sync-get-dataset-items` is capped by Apify's request timeout.

### 2.3 Category rules

`classifyJob` scores the title (double weight) and description against three weighted keyword dictionaries:

1. Explicit **"full stack" / MERN / MEAN** wording → `fullstack`.
2. Meaningful signal on **both** sides (frontend score ≥ 3 and backend score ≥ 3) → `fullstack`.
3. Otherwise the clearly dominant side wins.
4. No signal at all → `JOBS_DEFAULT_CATEGORY` (default `fullstack`) with confidence 0, which is dropped because it is below `JOBS_MIN_CONFIDENCE`.

Matching uses word boundaries, so `node` does not match `nodes`, and a keyword repeated 80 times is capped at two hits. Tech tags (`React`, `Kafka`, `PostgreSQL`, …) are detected separately for the embed.

### 2.4 HR email extraction

Emails are pulled from any `emails` field **and** from the description. Scoring prefers `hr@`, `hiring@`, `talent@`, `careers@`, `recruit@`, `jobs@`-style inboxes and filters the usual noise (`noreply@`, `support@`, `privacy@`, `abuse@`, `unsubscribe@`, asset filenames like `hero@2x.png`, placeholder domains).

Caveats worth knowing:

* It is a best-effort regex, not a guarantee. `/jobs emails` prints what was found so you can verify.
* Many listings simply do not contain an email — those posts omit the field.
* Only contact addresses you have a legitimate reason to contact; do not bulk-spam.

### 2.5 De-duplication

Two layers:

* SHA-1 of the normalised URL (tracking params stripped, host lower-cased, trailing slash removed).
* Fallback key of `normalised title + company`, which catches the same job re-posted on several boards with different URLs.

Both live in SQLite, so restarts and repeated scrapes never repost.

### 2.6 Scheduling

* `SCRAPE_INTERVAL_MINUTES=180` → one run every 3 hours (0 disables the timer).
* `SCRAPE_ON_START=true` → also run 10 seconds after login.
* `SCRAPE_MAX_POSTS_PER_RUN=10` caps how many embeds go out per run, so a backlog drains gradually instead of flooding the channel.
* Jobs older than `JOBS_MAX_AGE_DAYS` (14) are skipped.
* `/jobs-pause` and `/jobs-resume` toggle the timer without a restart; `/scrape` always works manually.

### 2.7 Commands

| Command | Who | Purpose |
| --- | --- | --- |
| `/scrape [limit] [dry]` | Manage Server | Run now; `dry:true` fetches and classifies but posts nothing. |
| `/jobs search query: [category] [limit]` | everyone | Search everything stored locally. |
| `/jobs emails [query] [limit]` | everyone | List extracted HR emails with company/role. |
| `/jobs stats` | everyone | Last run, totals, channel configuration, paused state. |
| `/jobs-setup frontend: backend: fullstack: log:` | Manage Server | Set channels at runtime (overrides `.env`). |
| `/jobs-pause`, `/jobs-resume` | Manage Server | Toggle the scheduler. |

---

## 3. DSA bot

### 3.1 How the per-person part works

`/dsa enroll` creates a **public thread** in `DSA_CHANNEL_ID` named `dsa-<username>` and posts the first question there, mentioning the member. Every day at their chosen local hour the scheduler drops the next question into that same thread (reopening it if Discord archived it). Each person therefore has a private-feeling, scrollable practice log, while the channel stays clean.

Delivery modes (`DSA_MODE`):

| Mode | Behaviour |
| --- | --- |
| `thread` (default) | One public thread per person. Works in every server; no boosts required. |
| `channel` | Posts into the channel and mentions the person. |
| `dm` | Sends a DM (requires the member to allow DMs from server members). |

### 3.2 The daily loop

1. Each user stores `timezone`, preferred `hour`, `difficulty`, `topics`, `last_sent_on`.
2. Every `DSA_TICK_MINUTES` (5) the scheduler checks active users. When their **local** date has not been served and their local hour has passed, it sends.
3. A question stays open until **Solved**, **Skipped**, or expired after `DSA_EXPIRE_DAYS` (2). No second question is sent while one is open.
4. Solved questions come back as **spaced reviews** after 7 days (3 days if hints were used or it was already a review), up to three times.
5. The next question is picked from an 86-question bank (22 easy, 50 medium, 14 hard across 31 topics) by weighted random: preferred topics and the target difficulty are boosted, topics the user skips are boosted (to practise them), the previous day's topic is dampened, and already-seen questions are excluded until the bank is exhausted.

### 3.3 Adaptive difficulty

With `difficulty: mixed`:

* fewer than 5 solves → **easy**
* 5–14 solves → **medium**
* 15+ solves → **medium**, with a 30% chance of **hard**
* two of the last five questions skipped → back to **easy**

A fixed `easy` / `medium` / `hard` setting overrides all of that.

### 3.4 Commands and buttons

Every question message carries **✅ Solved**, **💡 Hint**, **⏭️ Skip** buttons. Hints are progressive (one at a time, per question).

| Command | Purpose |
| --- | --- |
| `/dsa enroll [difficulty] [topics] [hour] [timezone]` | Create/update a profile, thread and first question. |
| `/dsa today` | Show the open question or send a new one if the queue is empty. |
| `/dsa done [notes]` | Mark solved (notes are stored with the assignment). |
| `/dsa skip` | Skip, reset the streak and get the editorial link. |
| `/dsa hint` | Next hint, ephemeral. |
| `/dsa stats [user]` | Streak, best streak, solved/skipped/expired, accuracy, strong/weak topics. |
| `/dsa leaderboard` | Top solvers in the server. |
| `/dsa settings difficulty: topics: hour: timezone: active:` | Change preferences, pause/resume. |
| `/dsa topics` | List every topic with autocomplete-ready names. |

`topics` accepts comma-separated values with autocomplete (`arrays`, `dp`, `trees`, …). Unknown topics are reported back instead of being silently dropped.

### 3.5 Extending the question bank

Edit `src/dsa-bot/bank.js` and add:

```js
problem(
  'my-question-id',
  'Question title',
  'medium',                       // easy | medium | hard
  ['arrays', 'two-pointers'],     // must exist in ALL_TOPICS or add a new topic there
  'One or two sentences describing the task.',
  ['First nudge.', 'Second, more specific nudge.'],
),
```

The link is derived as `https://leetcode.com/problems/<id>/`. `npm test` validates every entry (unique id, topic validity, at least two hints, link shape), so a typo is caught immediately.

---

## 4. Project layout

```
src/
  config.js               env parsing + defaults
  doctor.js               setup checker: env, tokens, actor, channels, invite URLs
  start.js                container entrypoint: BOT=jobs|dsa
  lib/
    apify.js              actor runner (sync dataset endpoint)
    db.js                 node:sqlite open/migrate helpers
    discord.js            client factory, command deployment, sleep
    http.js               /health endpoint for hosts
    logger.js             small levelled logger
    text.js               HTML stripping, truncation, slug/normalise
  jobs-bot/
    index.js              process entry: login, scheduler, interactions
    commands.js           slash commands + handlers
    run.js               fetch -> normalise -> classify -> store -> post
    store.js              jobs + settings schema
    post.js               embeds, buttons, channel resolution
    classify.js           frontend/backend/fullstack scoring
    normalize.js          Apify item -> job shape, field mapping
    emails.js             HR email extraction and filtering
    deploy-commands.js
  dsa-bot/
    index.js              process entry: login, daily tick, autocomplete
    commands.js           slash commands, buttons
    service.js            delivery, solving, streaks, stats embed
    store.js              users + assignments schema
    bank.js               curated question bank
    picker.js             weighted selection + adaptive difficulty
    tz.js                 timezone-aware date helpers
    deploy-commands.js
test/                     node:test suites (run with npm test)
data/                     SQLite files, created on first run (git-ignored)
```

Data files: `data/jobs.db` and `data/dsa.db` (plus `-wal`/`-shm` while running). Override the folder with `DATA_DIR`.

**Backups:** stop the process and copy `data/`, or run `VACUUM INTO` from a Node one-liner. Both bots share the same schema-migration style (`CREATE TABLE IF NOT EXISTS`), so upgrades are safe.

---

## 5. Where to host

What these bots need from a host:

* **A long-running process** with an outbound WebSocket to Discord. They do not need a public port and they must not sleep.
  Free tiers that spin down on idle (Render free web services, Koyeb scale-to-zero, Vercel/Netlify serverless) will simply show the bot as offline.
* **A persistent disk** for `data/*.db`. Any ephemeral filesystem means the jobs history and every DSA streak reset on each deploy.
* **~120-200 MB RAM per bot** (discord.js + SQLite + the question bank).

That rules out most "free" PaaS tiers. Realistic options, checked October 2026:

| Host | Cost for both bots | Disk | Verdict |
| --- | --- | --- | --- |
| **Northflank — Sandbox (free)** | $0, up to $20/mo of resources | Volumes included | Best free option: 2 always-on services + 1 database, no card, no sleeping. |
| **Fly.io** | ~$4.50/mo (2 × 256 MB machines) + $0.15/GB volume | Yes | Cheapest predictable paid option. A Discord worker at 256 MB is $2.19/mo per machine. |
| **Railway Hobby** | $5/mo (includes $5 usage) | Yes, 5 GB | Easiest GitHub deploys. The **Free** plan only grants $1/mo of usage, which will not keep two bots online 24/7. |
| **VPS (Hetzner / Contabo / DigitalOcean)** | ~$4-6/mo | Yes | Full control, run both under pm2. Cheapest if you already have one. |
| **Oracle Cloud Always Free** | $0 | Yes (block volume) | Genuinely free ARM/AMD VMs, but instances can be idle-reclaimed (CPU < 20% for 7 days) and signup is hit-or-miss. Keep it as a fallback, not the primary. |
| **Render** | $0 free tier is unsuitable; ~$7/mo per background worker | Free: none | Free web services spin down after 15 min and lose the filesystem. Only use paid workers with a disk. |
| **Your own PC / Raspberry Pi** | $0 | Yes | Fine for a personal server if it runs 24/7. |

### 5.1 Docker (works on Northflank / Fly / Railway / VPS)

The repo ships a `Dockerfile` and a single entrypoint:

```bash
docker build -t dc-bots .
docker run -d --name jobs -e BOT=jobs -v dc-data:/data --env-file .env dc-bots
docker run -d --name dsa  -e BOT=dsa  -v dc-data:/data --env-file .env dc-bots
```

`BOT=jobs|dsa` selects the process, `DATA_DIR` defaults to `/data` inside the image, and both bots auto-register their slash commands on startup when `CLIENT_ID` is present. Without Docker, use `npm run jobs` / `npm run dsa`.

### 5.2 Northflank (free)

1. Push the repo to GitHub, then **Create → Service → Build from repo**, Dockerfile build.
2. Create two services from the same repo: `job-bot` with `BOT=jobs`, `dsa-bot` with `BOT=dsa`.
3. Add the env vars from `.env` to the matching service (plus `GUILD_ID`).
4. Attach a volume mounted at `/data` to each service.
5. No port is required; leave networking private.

### 5.3 Fly.io

```bash
fly launch --no-deploy --name job-bot --dockerfile Dockerfile
fly volumes create data --size 1 -a job-bot
fly secrets set -a job-bot JOBS_DISCORD_TOKEN=... JOBS_CLIENT_ID=... GUILD_ID=...
fly deploy -a job-bot
```

Repeat with `--name dsa-bot` and `BOT=dsa`. In `fly.toml` set `[env] DATA_DIR = "/data"`, mount the volume, and leave out `[http_service]` — these are workers, not web apps. Use `shared-cpu-1x` / 256 MB (512 MB if you run both in one machine).

### 5.4 Railway

1. **New Project → Deploy from GitHub repo** (Dockerfile is detected).
2. Two services from the same repo; set `BOT=jobs` / `BOT=dsa` plus that bot's env vars.
3. **Variables → add volume**, mount path `/data`, and set `DATA_DIR=/data`.
4. Start command is already handled by the image; no public domain needed.

### 5.5 Plain VPS

```bash
git clone <your repo> /opt/dc-bots && cd /opt/dc-bots
npm ci --omit=dev
pm2 start npm --name jobs -- run jobs
pm2 start npm --name dsa  -- run dsa
pm2 save && pm2 startup
```

Back up `data/` (or `docker cp` the volume) before moving hosts. Keeping the two bots as separate processes means a slow Apify run never delays the morning questions.


---

## 6. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Missing JOBS_DISCORD_TOKEN` | `.env` is not being read or the variable is empty. Run from `E:\bots`. |
| Slash commands don't appear | Set `GUILD_ID` and restart (instant), or wait up to an hour for global commands. Re-invite with the `applications.commands` scope. |
| `Missing Access` / cannot post | Bot lacks View Channel / Send Messages / Embed Links on that channel, or the channel ID is wrong. |
| Jobs go to the wrong channel | Set `JOBS_MIN_CONFIDENCE` higher, or check `/jobs stats` — channel overrides from `/jobs-setup` beat `.env`. |
| Nothing is posted after a scrape | All results were duplicates, stale, below confidence, or had no configured channel. `/scrape dry:true` shows the counters. |
| Apify timeout | Lower `APIFY_MAX_ITEMS`, or raise `APIFY_TIMEOUT_SECS` (max ~300s for the sync endpoint). |
| Apify returns 0 items | Wrong `APIFY_ACTOR_ID`, or your `APIFY_INPUT_JSON` does not match the actor's schema. Test the input in Apify's UI first. |
| No HR emails | The listing genuinely has none, or the address is filtered as robotic. Check `/jobs emails`. |
| DSA thread not created | Bot needs **Create Public Threads** and **Send Messages in Threads** in the DSA channel. Private threads are not used — public threads work without server boosts. |
| Nobody gets questions | `DSA_HOUR` is in each user's own timezone; a user who enrolled at 14:00 with `hour: 9` gets their first question the next morning (or run `/dsa today`). Check `/dsa stats`. |
| `Cannot find module 'node:sqlite'` | Node is older than 22.5. |
| Unsure what is misconfigured | Run `npm run doctor` — it checks the Node version, `.env`, data directory, both bot tokens, the Apify actor and all channel IDs, then prints the invite URLs. |
| Discord rate limits | Posting is throttled to one embed every 1.2s and discord.js queues the rest; lower `SCRAPE_MAX_POSTS_PER_RUN` if you post a lot. |

---

## 7. Legal / etiquette

* Only scrape sources your Apify actor is allowed to scrape, and respect each site's terms and robots policy.
* Extracted emails are personal data in many jurisdictions — use them for relevant applications only, honour opt-outs, and don't resell or bulk-send.
* The DSA bank links to public LeetCode problems and paraphrases their statements; hints are original summaries, not copied editorials.
