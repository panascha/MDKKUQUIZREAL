# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MDKKUQUIZREAL is the student-facing quiz app (PWA, ver 3.0) for MDKKUQUIZ, a medical exam quiz platform for KKU medical students (batch 52). Remote: github.com/panascha/MDKKUQUIZREAL.

**No build step, no npm, no bundler.** Plain HTML + vanilla JS + CSS served as static files. Open `index.html` directly in a browser or deploy by pushing to GitHub.

This repo is one of three sibling sub-repos in a parent monorepo (`MDKKUQUIZDATABASE` admin dashboard, `MDKKUQUIZBACKEND` GAS backend). See the parent folder's `CLAUDE.md` for cross-repo context, deployment commands, and the `/deploy`, `/issuelist`, `/parse-elearning` slash commands.

## Deployment

```bash
git add <files>
git commit -m "..."
git push origin main
```

The GAS backend URL is hardcoded in `js/config.js` as `window.APPSCRIPT_URL`. Changing backends/URLs requires editing this file; normal backend updates (via `clasp deploy -i`) keep the same URL and need no change here.

## Architecture

Single `index.html` with all HTML/modals inline. CSS is a single `css/styles.css`. JS is split into modules loaded in this exact order via `<script>` tags at the bottom of `index.html` — **order matters**, each file may call functions defined in earlier files:

| File | Role & Key Functions |
|------|----------------------|
| `js/config.js` | Global constants: `window.APPSCRIPT_URL`, `window.APP` state object, `window.OMR_CONFIG` for PDF grading layout |
| `js/db.js` | IndexedDB wrapper — `openDB()` (memoizes `window._dbConnPromise`, only reopens after `onclose`), `getCacheDB()`, `setCacheDB()`, `saveProgressToCache()` — offline caching of questions and session state |
| `js/api.js` | `sendWithRetry()` for POST to GAS with retry logic; `sendActivityLog()` buffers analytics events to `localStorage['activityBuffer']` — `flushActivityLog()` batches them to GAS `action:'batchLog'` when the buffer has ≥5 entries, 60s have elapsed, or the tab has been hidden >15s; `saveReportToGoogleSheet()` |
| `js/search.js` | Full-text search with fuzzy matching and LRU cache (`window.searchDictionary`) |
| `js/quiz.js` | `renderIndexPanel()`, `jumpToQuestion()`, `showQuestion()`, `submitQuestion()`, `checkAnswerUI()`, `updateQuestionSet()` — index panel dot-grid and question navigation |
| `js/vote.js` | `fetchPendingVotes()`, `submitVoteData()` — community voting on question categories; `activeVoteFetches` Set dedupes concurrent fetch calls |
| `js/report.js` | Report incorrect question modal |
| `js/ui.js` | `displayAnswerContent()`, `getCategoryNameById()`, `renderAccordionUI()`, `renderAttributeFilterUI()`, `viewFullImage()`, `window.renderAnnouncementsUI()` — UI helpers, zoom, image gallery, announcement banner |
| `js/auth-edit.js` | `initiateGoogleLogin()`, `handleCredentialResponse()`, `resumeSessionFromToken()`, `enableEditModeUI()` — Google SSO via `window.EDIT_SESSION`; 30-day GAS-issued `sessionToken` in `localStorage` (`mdkku_session_token`); `logoutEditMode()` calls GAS `deleteSession` to invalidate server-side |
| `js/edit-modal.js` | Edit question modal (admin only) — image upload, AI assist, choice management |
| `js/app.js` | `initApp()`, `populateSubjectSelector()`, `showSubmission()`, `runIncrementalSync()`, `updateProgressHeader()` — core app logic, subject/category selector, question rendering, score tracking |
| `js/pdf-generator.js` | Export exam set to PDF with OMR answer sheet (jsPDF + KaTeX + embedded TH Sarabun font) |
| `js/grader.js` | Auto-grader: reads OMR data embedded in exported PDFs via pdf.js |
| `service-worker.js` | PWA: cache-first for static assets; never intercepts GAS or Google API calls |

**Global state** lives on `window.APP` (defined in `config.js`). All JS functions are attached to `window.*` to share scope across script files — there are no ES modules.

**External CDN dependencies**: jQuery 3.7, SweetAlert2, Font Awesome 6, jsPDF 2.5, pdf.js 3.11, KaTeX 0.16, Google Identity Services.

## Data Format

Questions use `///` as a multi-value separator:
- `q.img` — multiple image URLs joined by `///`
- `q.choices` — choice texts joined by `///`
- `q.category` — array of categoryIds

Image URLs from Google Drive are transformed via `window.transformUrl()` to use the direct download format.

## Key Invariants

- **All JS functions must be `window.*`** — no `const`/`let` at module scope for shared functions, or they won't be accessible cross-file.
- **Never intercept GAS requests in the service worker** — it explicitly passes through `script.google.com` calls.
- **`///` is the data delimiter** for multi-value fields — never use commas or pipes inside question data.
- **Session token**: 30-day GAS-issued token system. `localStorage['mdkku_session_token']` holds a 64-char token. `window.EDIT_SESSION.sessionToken` holds it in memory. `logoutEditMode()` calls GAS `deleteSession` to revoke it server-side. All edit-modal API calls send `sessionToken`, not `googleIdToken`.
- **IndexedDB cache key pattern**: `session_state_<subjectParam>`, `all_subjects_list_v2`, question data keyed by subject.
- **Analytics is batched, not per-event** — `logUserActivity` (old per-event endpoint) no longer exists on the backend; all analytics goes through the `activityBuffer` → `batchLog` path in `js/api.js`.

## Known Open Issues (this repo)

- 🟠 `vote.js:~123` — downvote still pushes category into local `q.category` unconditionally regardless of `delta` sign.
- 🟡 `auth-edit.js` `setupGoogleSSO` — if GIS init throws, `resumeSessionFromToken` is silently skipped (unverified, presumed unchanged).
- 🟡 `ui.js:858` — export codes are plain Base64, score tamper possible (unverified, presumed unchanged).

Full cross-repo issue list: parent `Idea/active/code-review-2026-06-14.md` or `/issuelist`.