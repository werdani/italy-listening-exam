# ListenLab — Listening Comprehension Exam

A production-ready, client-side **Listening Exam** web application built with **HTML, CSS, and Vanilla JavaScript** (no frameworks). Inspired by Google Forms, IELTS computer-based tests, and the Duolingo English Test.

**Live demo (GitHub Pages):** `https://<your-username>.github.io/<repo-name>/`

---

## Features

- Home screen with exam title, description, question count, total marks, and duration
- Timed exam with auto-submit when the countdown reaches zero
- Per-question MP3 audio player (replay allowed; download controls discouraged)
- Multiple-choice answers with Previous / Next navigation
- Progress label and animated progress bar
- Optional “prevent skipping unanswered questions” toggle
- Score calculation: total score, percentage, correct / wrong counts, time taken
- Results page with Pass / Fail verdict and full question review (green / red)
- Light & dark themes with preference saved in `localStorage`
- Exam progress persistence (question index, answers, remaining time) with resume on refresh
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

### Option A — Python

```bash
cd ListeningExam   # or your clone directory
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

### Option B — Node (npx)

```bash
npx serve .
```

### Option C — VS Code / Cursor

Use the “Live Server” (or similar) extension and open `index.html`.

---

## Folder structure

```
ListeningExam/
├── index.html              # App shell & screens
├── css/
│   └── style.css           # Themes, layout, animations
├── js/
│   └── app.js              # Exam engine
├── data/
│   └── questions.json      # Exam config + 10 sample questions
├── assets/
│   ├── audio/              # q1.mp3 … q10.mp3
│   └── images/             # Logo & screenshot placeholders
├── .gitignore
├── .nojekyll               # GitHub Pages (bypass Jekyll)
└── README.md
```

---

## Question data format

Edit `data/questions.json`:

```json
{
  "exam": {
    "title": "Listening Comprehension Exam",
    "description": "…",
    "durationMinutes": 15,
    "marksPerQuestion": 1,
    "passPercentage": 60,
    "preventSkip": true
  },
  "questions": [
    {
      "id": 1,
      "prompt": "Which fruit is mentioned in the recording?",
      "audio": "assets/audio/q1.mp3",
      "choices": ["Apple", "Orange", "Banana", "Mango"],
      "correct": 0
    }
  ]
}
```

- `correct` is a **zero-based** index into `choices`.
- `audio` paths must be **relative** to `index.html`.
- Sample MP3 files are demo placeholders — replace them with real listening clips for classroom use. Scoring always follows the `correct` field in JSON.

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
