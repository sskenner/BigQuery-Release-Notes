# BigQuery Release Radar 📡

A premium web application built with **Python Flask** and **Vanilla HTML/CSS/JS** to fetch, search, filter, and share specific Google BigQuery release notes on X (Twitter).

---

## 🌟 Key Features

### 1. Hybrid Parse & Split Engine
Google publishes release notes grouped by date. If multiple items are released on the same day, they are lumped together in one feed entry.
The backend uses a **hybrid parsing engine**:
- **`xml.etree.ElementTree`**: Parses the outer XML structure (Atom schema) securely without warnings.
- **`BeautifulSoup`**: Interrogates the inner HTML content. If it detects multiple category headers (`<h3>`), it splits the entry into **separate, distinct cards**. This allows you to select, search, and Tweet about *individual updates* rather than a giant lump of text.

### 2. Premium Design System (Aesthetics)
The design prioritizes visual excellence and futuristic dark-mode gradients:
- **Glowing Background**: Moving radial gradients create a modern depth effect.
- **Glassmorphism Panels**: UI cards use `backdrop-filter: blur` and subtle borders to look polished and premium.
- **Color-Coded Badging**: Categorized glowing tags help map the feed:
  - 🟢 **Feature**: Green accent
  - 🔵 **Changed**: Blue accent
  - 🟡 **Fixed**: Orange/Yellow accent
  - 🔴 **Deprecated**: Red accent
  - 🟣 **General**: Purple accent

### 3. Smart Live-Updating Tweet Composer
The sidebar houses a simulated dark-mode **X (Twitter) Preview Card** that updates in real time:
- **Preset Templates**: Toggle between 🚀 **Casual**, 💼 **Professional**, and 📝 **Bullet Point** tweet drafts.
- **Auto-Truncation**: Checks character length against a 280-character budget and truncates descriptions dynamically to fit.
- **Virtual Link Counting**: Recognizes that Twitter shortens all URLs to a 23-character `t.co` link, ensuring accurate limits.
- **Dynamic Progress Ring**: Built using SVG stroke dashoffsets, transition colors (Blue ➔ Yellow ➔ Red) as you approach the character threshold.
- **Clipboard & Intent Actions**: Allows copying formatted text to clipboard or opening X's Web Intent to post directly without requiring complex OAuth setups.

---

## 📂 Project Directory Structure

- [`app.py`](file:///home/nimda/agy-cli-projects/bq-releases-notes/app.py): Flask backend containing the feed fetching, XML-to-HTML parser hybrid, in-memory cache, and JSON API.
- [`templates/index.html`](file:///home/nimda/agy-cli-projects/bq-releases-notes/templates/index.html): Semantic HTML5 template utilizing Google Fonts (*Plus Jakarta Sans* & *JetBrains Mono*) and Lucide Icons.
- [`static/css/style.css`](file:///home/nimda/agy-cli-projects/bq-releases-notes/static/css/style.css): Futuristic dark glassmorphic design system using CSS variables, glowing tag states, custom animations, and responsive media queries.
- [`static/js/app.js`](file:///home/nimda/agy-cli-projects/bq-releases-notes/static/js/app.js): Core frontend controller managing client-side search, filtering, selection, template generation, character limits, clipboard copying, and sharing intents.
- [`requirements.txt`](file:///home/nimda/agy-cli-projects/bq-releases-notes/requirements.txt): Python dependencies package list.
- [`.gitignore`](file:///home/nimda/agy-cli-projects/bq-releases-notes/.gitignore): System, environment, and IDE exclusion specifications for Git.

---

## 🚀 Getting Started

### 1. Installation

Clone the repository and navigate to the project directory:
```bash
git clone <your-repository-url>
cd bq-releases-notes
```

Create and activate a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

Install dependencies:
```bash
pip install -r requirements.txt
```

### 2. Running the Server

Start the Flask development server:
```bash
python app.py
```

Open your browser and navigate to **`http://localhost:5000`** to view the app.
