# DSA Sheet by Shwetank 📊

> Master Data Structures & Algorithms, one problem at a time.

A premium, dark-themed DSA preparation platform with progress tracking across 240+ curated problems.

## ✨ Features

- **4 Study Sections**: DSA, Interview Prep, System Design, OOPs
- **3 Difficulty Levels**: Beginner, Intermediate, Advanced (20 problems each)
- **Progress Tracking**: Mark questions as To Do / In Progress / Done
- **Google OAuth**: Secure login with Google
- **Persistent Progress**: Supabase backend for cross-device sync
- **Responsive Design**: Desktop sidebar + Mobile bottom nav
- **Obsidian Dark Theme**: Premium #0a0a0a aesthetic with lime green accents

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML + CSS + JS |
| Backend | Node.js + Express |
| Auth | Passport.js + Google OAuth 2.0 |
| Database | Supabase (PostgreSQL) |
| Hosting | Netlify (frontend) + Render (backend) |
| Design System | Stitch MCP — "Obsidian Architect" |

## 📁 Project Structure

```
├── frontend/
│   ├── index.html          # Landing + Level Selection
│   ├── dashboard.html      # Main dashboard with section cards
│   ├── section.html        # Question list with status buttons
│   ├── style.css           # Complete design system
│   └── app.js              # Frontend application logic
├── backend/
│   ├── server.js           # Express server entry point
│   ├── routes/
│   │   ├── auth.js         # Google OAuth routes
│   │   ├── questions.js    # Questions API
│   │   └── progress.js     # Progress tracking API
│   ├── config/
│   │   └── passport.js     # Passport.js configuration
│   └── data/
│       └── questions.json  # 240 curated problems
├── .env.example            # Environment variables template
├── netlify.toml            # Netlify deployment config
└── README.md               # This file
```

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/shwetankrai12/dsasheetbyshwetank.git
cd dsasheetbyshwetank
cd backend && npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Fill in your Google OAuth credentials and Supabase keys
```

### 3. Run Locally

```bash
# Backend (from /backend)
node server.js

# Frontend (from /frontend — use any static server)
npx serve .
```

### 4. Deploy

- **Frontend → Netlify**: Connect repo, set publish dir to `frontend/`
- **Backend → Render**: Deploy `backend/` as a Node.js service
- Update `netlify.toml` with your Render URL

## 🎨 Design System

Designed using **Stitch MCP** with the "Obsidian Architect" theme:

- **Background**: `#0a0a0a` (near black)
- **Surface**: `#131313` → `#1c1b1b` → `#262626` (layered depth)
- **Accent**: `#a3e635` (lime green) — used sparingly as a "laser"
- **Font**: Inter (all weights)
- **Philosophy**: No borders, tonal depth, editorial precision

## 📝 License

MIT © Shwetank
