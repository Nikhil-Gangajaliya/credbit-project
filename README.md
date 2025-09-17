# Ledger Phase 2 - Source Code (no node_modules, no DB)

This zip contains the full source code for the Phase-2 Ledger project (Node.js + SQLite).
It intentionally DOES NOT include `node_modules` or `data.db`.

## Files
- package.json
- db.js
- server.js
- public/
  - index.html
  - app.js
  - style.css
- README.md

## Quick start (on your machine)
1. Install Node.js (v16+ recommended).
2. Extract the zip into a folder, open terminal in that folder.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Initialize database (creates `data.db`):
   ```bash
   npm run init-db
   ```
5. Start server:
   ```bash
   npm start
   ```
6. Open `http://localhost:3000` in your browser.

## Default credentials
- username: `admin`
- password: `admin123`

Please change the admin password after first run (this project is for local/testing use).

## Notes
- Exports (Excel/PDF) require the server to be running.
- The project is intentionally simple and ready for extending (sessions, JWT, RBAC, edit/delete, pagination).
