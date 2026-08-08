# AscoltoIT — Esame di Ascolto (Italiano)

A production-ready, client-side **Italian listening exam** web application built with **HTML, CSS, and Vanilla JavaScript** (no frameworks). UI and sample questions are in **Italian**. Inspired by Google Forms, IELTS computer-based tests, and language placement exams.

**Live demo (GitHub Pages):** `https://<your-username>.github.io/<repo-name>/`

---

## Features

- Home screen with exam title, description, **level picker**, question count, total marks, and duration
- Timed exam with auto-submit when the countdown reaches zero
- Per-question MP3 audio player (replay allowed; download controls discouraged)
- Multiple-choice answers with Previous / Next navigation
- Progress label and animated progress bar
- Optional “prevent skipping unanswered questions” toggle
- Score calculation: total score, percentage, correct / wrong counts, time taken
- Results page with Pass / Fail verdict and full question review (green / red)
- Light & dark themes with preference saved in `localStorage`
- Exam progress persistence (question index, answers, remaining time) with resume on refresh
- **Admin Dashboard** (`/admin/`) to manage levels and voice questions
- Keyboard support (arrows, 1–4 for choices, modal Escape)
- Fully responsive layout (desktop, tablet, mobile)
- Accessible labels, focus styles, skip link, and reduced-motion support
- Relative paths only — works on GitHub Pages with no backend

---

## Screenshots

> Replace these placeholders with real screenshots after you run the app.

| Home | Exam | Results |
|------|------|---------|
| ![Home screen placeholder](assets/images/screenshot-home.png) | ![Exam screen placeholder](assets/images/screenshot-exam.png) | ![Results placeholder](assets/images/screenshot-results.png) |

You can capture screenshots from your browser and save them as:

- `assets/images/screenshot-home.png`
- `assets/images/screenshot-exam.png`
- `assets/images/screenshot-results.png`

---

## How to run locally

Because the app loads `data/questions.json` with `fetch()`, it must be served over **HTTP** (opening `index.html` via `file://` will fail in most browsers).

### Option A — Python (recommended — saves admin changes to disk)

```bash
cd ListeningExam   # or your clone directory
python3 server.py
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080) and admin at [http://127.0.0.1:8080/admin/](http://127.0.0.1:8080/admin/).

This server writes admin changes to `data/questions.json`, so new levels appear on the exam immediately.

### Option B — Plain static server (no auto-save to file)

```bash
python3 -m http.server 8080
```

Admin changes stay in the browser only unless you use **Esporta JSON**.

### Option C — Node (npx)

```bash
npx serve .
```

### Option D — VS Code / Cursor

Use the “Live Server” (or similar) extension and open `index.html`.

---

## Admin Dashboard

Manage **levels → voice questions → answer options → correct answer** at [`admin/`](admin/).

1. Open `/admin/` (or click **Area admin** on the home page).
2. Sign in with default credentials: **`Reham`** / **`Ammar45@@`**
3. Create or edit levels, then open a level to add voice questions (upload audio or set a path like `assets/audio/q1.mp3`).
4. Changes are saved to **`data/questions.json`** when you run `python3 server.py` (recommended). The exam then shows them on refresh.
5. Click **Esporta JSON** if you only use a plain static server and need a downloadable file.
6. **Ripristina file** reloads from `data/questions.json`.

### Data model (levels)

```json
{
  "exam": { "title": "…", "durationMinutes": 15, "…": "…" },
  "levels": [
    {
      "id": 1,
      "name": "Livello 1",
      "description": "…",
      "questions": [
        {
          "id": 1,
          "prompt": "Dove lavora?",
          "audio": "assets/audio/q1.mp3",
          "choices": ["A", "B", "C", "D"],
          "correct": 0
        }
      ]
    }
  ]
}
```

Learners pick a level on the home screen before starting the exam.

---

## Folder structure

```
ListeningExam/
├── index.html              # Exam app shell
├── admin/
│   ├── index.html          # Admin login + dashboard
│   ├── css/admin.css
│   └── js/
│       ├── auth.js         # Login / session
│       └── admin.js        # Levels & questions CRUD
├── css/
│   └── style.css
├── js/
│   ├── content.js          # Shared content store (exam + admin)
│   └── app.js              # Exam engine
├── data/
│   └── questions.json      # Exam config + levels + questions
├── assets/
│   ├── audio/
│   └── images/
├── .gitignore
├── .nojekyll
└── README.md
```

---

## Question data format

Edit `data/questions.json` (or use the Admin Dashboard):

```json
{
  "exam": {
    "title": "Esame di Ascolto — Italiano",
    "description": "…",
    "durationMinutes": 15,
    "marksPerQuestion": 1,
    "passPercentage": 60,
    "preventSkip": true
  },
  "levels": [
    {
      "id": 1,
      "name": "Livello 1",
      "description": "Domande di ascolto di base.",
      "questions": [
        {
          "id": 1,
          "prompt": "Quale frutto viene menzionato nella registrazione?",
          "audio": "assets/audio/q1.mp3",
          "choices": ["Mela", "Arancia", "Banana", "Mango"],
          "correct": 0
        }
      ]
    }
  ]
}
```

- `correct` is a **zero-based** index into `choices`.
- `audio` paths must be **relative** to `index.html` (or a `data:` URL from admin upload).
- Sample MP3 files are Italian speech clips (TTS) matched to the answer key — replace them with your own recordings if needed.

---

## GitHub Pages deployment

1. Create a new GitHub repository and push this project:

   ```bash
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git branch -M main
   git push -u origin main
   ```

2. In the repo on GitHub: **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Select branch **`main`** and folder **`/ (root)`**, then save.
5. Wait a minute, then open:

   `https://<your-username>.github.io/<repo-name>/`

Notes:

- `.nojekyll` is included so GitHub Pages serves files as-is.
- All asset URLs are relative — no absolute domain paths required.
- If the site is published under a project path, relative links still resolve correctly.

### Custom domain (optional)

Add a `CNAME` file in the repo root with your domain, then configure DNS per [GitHub Pages docs](https://docs.github.com/en/pages).

---

## Keyboard shortcuts (exam screen)

| Key | Action |
|-----|--------|
| `←` | Previous question |
| `→` | Next question |
| `1`–`4` | Select choice A–D |
| `Esc` | Close confirmation dialog |

---

## Browser support

Modern evergreen browsers (Chrome, Firefox, Safari, Edge). Requires JavaScript enabled.

---

## License

This project is provided as a starter template for educational use. Replace sample audio with content you have rights to distribute before publishing publicly.
