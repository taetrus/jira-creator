# Jira Issue Creator

A simple browser-based tool that parses a `PLANNING.md` file and bulk-creates Jira issues (Epics → Stories → Subtasks + standalone Tasks) via the Jira REST API.

## Getting Started

```bash
npm install
npm run dev
# Open http://localhost:5173
```

## Usage

The app is a 3-step wizard:

### Step 1 — Config

Fill in your Jira connection details:

| Field | Description |
|---|---|
| Base URL | Your Jira server, e.g. `https://jira.company.com` |
| Auth Method | **Basic** (username + token/password) or **Bearer** (PAT, requires Jira 8.14+) |
| Username | Your Jira username |
| Token / Password | API token or password |
| Project Key | The short key of your Jira project, e.g. `PROJ` |
| Label | Label added to every created issue (default: `EATL`) |

Config is saved to `localStorage` so you don't need to re-enter it each time.

**Custom Fields** — every Jira instance uses different `customfield_*` IDs for Epic Name, Epic Link, and Story Points. Click **Discover Fields** to fetch the list from your server, then click any row to auto-fill the matching field ID.

### Step 2 — Parse

Upload your `PLANNING.md` file or paste its contents into the text area. Click **Parse** to see a tree preview of all issues that will be created, with story point totals.

Expected format:

```markdown
## 🟣 EPIC-1 · Epic Title
> *Epic description*

### 🔵 STORY-1.1 · Story Title
**"User story description"**

| Subtask | SP |
|---|---|
| ⬜ Subtask description | 3 |
| **Toplam** | **3** |

## 🟡 TASKS
| TASK-1 | Task title | 2 | Optional notes |
```

### Step 3 — Create

Check **Dry Run** first to verify the parsed output without making any API calls. When ready, click **Create All Issues** to watch a live log as each issue is created in order: Epics → Stories → Subtasks → Tasks.

---

## CORS Errors

Browsers block cross-origin requests by default. When you run this app on `localhost:5173` and it calls `https://jira.company.com`, Jira must explicitly allow it. If it doesn't, you'll see an error like:

```
Access to fetch at 'https://jira.company.com/...' from origin 'http://localhost:5173'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present.
```

There are three ways to fix this, ordered from cleanest to quickest:

---

### Option 1: Configure Jira to allow CORS (Recommended)

This is the proper fix for self-hosted Jira Server/Data Center. A Jira admin adds `localhost:5173` to the allowed origins.

**Jira Server / Data Center (8.x+):**

1. SSH into the Jira server.
2. Open `<jira-home>/jira-config.properties` (create it if it doesn't exist).
3. Add:
   ```
   jira.cors.allowed.origins=http://localhost:5173
   ```
4. Restart Jira.

If you deploy this app to a real domain later, add that domain to the list instead.

**Jira Data Center with a reverse proxy (nginx/Apache):**

Add CORS headers in your proxy config. For nginx:

```nginx
location /rest/ {
    proxy_pass http://jira-backend;
    add_header Access-Control-Allow-Origin "http://localhost:5173";
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS";
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept";
    if ($request_method = OPTIONS) {
        return 204;
    }
}
```

---

### Option 2: Browser extension (Quick, no server access needed)

Install one of these extensions and enable it while using the app:

| Browser | Extension |
|---|---|
| Chrome / Edge | [CORS Unblock](https://chrome.google.com/webstore/detail/cors-unblock/lfhmikememgdcahcdlaciloancbhjino) |
| Chrome / Edge | [Allow CORS: Access-Control-Allow-Origin](https://chrome.google.com/webstore/detail/allow-cors-access-control/lhobafahddgcelffkeicbaginigeejlf) |
| Firefox | [CORS Everywhere](https://addons.mozilla.org/en-US/firefox/addon/cors-everywhere/) |

> **Security note:** Disable the extension when you're done or when visiting other sites — it bypasses a browser security feature that protects you on normal websites.

---

### Option 3: Run Chrome without CORS enforcement (Development only)

Launch Chrome with the security flag disabled. **Only do this in a dedicated dev browser window, never for general browsing.**

**macOS:**
```bash
open -n -a "Google Chrome" --args --disable-web-security --user-data-dir="/tmp/chrome-dev"
```

**Windows:**
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --disable-web-security --user-data-dir="C:\Temp\chrome-dev"
```

Navigate to `http://localhost:5173` in that window.

---

## Building for Production

```bash
npm run build
# Output is in dist/ — serve it with any static file server
```

If you host the built app somewhere other than `localhost`, remember to update the allowed CORS origin in your Jira config to match the new domain.
