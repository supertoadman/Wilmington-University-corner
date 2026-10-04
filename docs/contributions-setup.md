# Contributions: how they work and how to turn them on

People share their work through the **Share your work** page (`/contribute/`). They don't need an account. Each submission becomes a **GitHub pull request**, and nothing is published until you approve it.

```
Contributor fills the form on the site
        │  (file + title, subject, type, optional credit, 3 confirmations)
        ▼
Relay function (Cloudflare Worker, free)        submissions/worker.mjs
  • spam traps (hidden field, too-fast submits, optional CAPTCHA)
  • validates type, size, and real file contents
  • adds ONLY new files: the document + "<file>.meta.json"
        ▼
Pull request on GitHub, labelled "submission"
  • automated safety report posted as a comment   .github/workflows/check-submission.yml
  • you review → Merge = publish, Close = reject
        ▼
Site rebuilds and deploys automatically (about a minute)
```

## Why this design

- **Approval is built in.** Your repository's main branch is the only thing the site publishes. Submissions can only open pull requests, so nothing goes live without a merge.
- **No conflicts.** Each submission adds new files and never edits shared ones, so you can approve submissions in any order.
- **Easy to move.** The relay is about 200 lines of web-standard code in `submissions/`. It runs on Cloudflare Workers today and can move to Netlify, Vercel, Deno, or a small Node server without changes to the core.
- **Nothing private is stored.** The form never asks for an email. The only personal detail is the optional credit name, which the contributor chooses to make public.

## Try it locally (no setup)

```bash
npm run dev
```

1. Open http://localhost:4173/Wilmington-University-corner/contribute/ and submit a file.
2. Open http://localhost:4173/Wilmington-University-corner/__review/ to see the submission, its safety report, and the **Approve** and **Reject** buttons.
3. Approve it, and it appears on the local site under its subject.

Local submissions are saved in `.submissions/`, which git ignores. Approving one copies its files into `content/`, which is exactly what merging the pull request does in production. To undo a test, delete the files it added in `content/`.

## Turn it on for the live site (one-time, about 15 minutes)

You'll create a GitHub token and a free Cloudflare account. Never paste the token into chat, a file, or the repo. It only goes into Cloudflare's secret store.

### 1. Create a GitHub token for the relay

1. Go to GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access:** *Only select repositories* → `Wilmington-University-corner`.
3. **Permissions → Repository permissions:** *Contents*: **Read and write**, *Pull requests*: **Read and write**. Leave everything else at *No access*.
4. **Expiration:** pick the longest option offered, and set a calendar reminder to renew it. When the token expires, the form shows a polite error until you put in a new one (step 3 below).

### 2. Deploy the relay to Cloudflare

1. Create a free account at https://dash.cloudflare.com/sign-up.
2. In a terminal, from the project folder:

   ```bash
   cd submissions
   npx wrangler login
   npx wrangler deploy
   ```

3. Wrangler prints the relay's address, something like `https://study-library-submissions.<you>.workers.dev`.

### 3. Give the relay the token

```bash
npx wrangler secret put GITHUB_TOKEN
```

Paste the token when prompted. It's stored encrypted in Cloudflare and never appears in the repo.

### 4. Point the site at the relay

In `site.config.json`, set:

```json
"submissions": {
  "endpoint": "https://study-library-submissions.<you>.workers.dev/submit",
  "turnstileSiteKey": "",
  "maxMB": 20
}
```

Commit and push. The **Share your work** page now accepts submissions. Until `endpoint` is set, the page shows "Submissions aren't open yet."

### 5. Protect the main branch (recommended)

GitHub → repository **Settings → Branches → Add branch ruleset** (or *Add rule*) for `main`:
- **Require a pull request before merging**
- **Require status checks to pass** → choose **Check submission / check**

This makes the pull request the only way into the live site, and keeps submissions with a failed safety check from being merged until they're fixed.

### 6. Optional: add a CAPTCHA if spam shows up

1. Cloudflare dashboard → **Turnstile → Add widget** for `supertoadman.github.io`.
2. Put the **site key** in `site.config.json` → `submissions.turnstileSiteKey`.
3. Store the **secret key** on the relay: `npx wrangler secret put TURNSTILE_SECRET`.

## Reviewing a submission

1. You get a GitHub notification for each new pull request labelled **submission**. The GitHub mobile app works well for this.
2. Read the description table, and check the **Safety check** comment the robot posts.
3. Open **Files changed** to look at the document:
   - **PDF:** GitHub previews it inline.
   - **Word / HTML:** click the file's **⋯ → View file → Download / Raw** to open it.
4. To fix the title, description, or credit, edit the `*.meta.json` file right in the pull request.
5. **Merge pull request** publishes it. **Close pull request** rejects it, and nothing is published.

## Changing the rules

| What | Where |
| --- | --- |
| Allowed file types, size limit, field lengths | `submissions/core.mjs` (`ALLOWED_EXTENSIONS`, `LIMITS`), and `maxMB` in `site.config.json` |
| Safety checks (personal info patterns, trusted script hosts, ...) | `submissions/checks.mjs` |
| Form wording and guidelines | `contribute()` in `src/templates.mjs` |
| Pull request text and reviewer checklist | `plan()` in `submissions/core.mjs` |

## Moving the relay elsewhere

`handleSubmit(request, { adapter, env })` in `submissions/core.mjs` takes a standard `Request` and returns a standard `Response`. To host it somewhere else, write a 10-line wrapper like `submissions/worker.mjs` that builds `githubAdapter({ token, repo })` from that platform's environment variables.
