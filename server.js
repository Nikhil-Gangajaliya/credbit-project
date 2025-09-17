// server.js
const express = require('express');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcryptjs = require('bcryptjs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const helmet = require('helmet');
const cors = require('cors');

const DB_PATH = path.join(__dirname, 'data.db');
if (!fs.existsSync(DB_PATH)) {
  console.error('Database not found. Run: npm run init-db');
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const app = express();
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ----- AUTH (very basic) -----
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row) return res.status(401).json({ error: 'Invalid credentials' });
  if (!bcrypt.compareSync(password, row.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ ok: true, username: row.username, role: row.role });
});

// ----- CHANGE CREDENTIALS -----
app.post('/api/change-credentials', (req, res) => {
  const { oldUsername, oldPassword, newUsername, newPassword } = req.body;
  if (!oldUsername || !oldPassword || !newUsername || !newPassword) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(oldUsername);
  if (!user) return res.status(401).json({ error: 'Invalid old credentials' });

  if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid old password' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?')
    .run(newUsername, hash, user.id);

  res.json({ ok: true, message: 'Credentials updated. Please login again.' });
});


// ----- PARTIES -----
// create party
app.post('/api/parties', (req, res) => {
  const { name, mobile, email } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const insert = db.prepare('INSERT OR IGNORE INTO parties (name, mobile, email) VALUES (?,?,?)');
    insert.run(name, mobile || null, email || null);
    const party = db.prepare('SELECT * FROM parties WHERE name = ?').get(name);
    res.json({ ok: true, party });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// list parties with current balance (credit - debit)
app.get('/api/parties', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.name, p.mobile, p.email,
      IFNULL(SUM(e.credit),0) as total_credit,
      IFNULL(SUM(e.debit),0) as total_debit,
      IFNULL(SUM(e.credit),0) - IFNULL(SUM(e.debit),0) as balance
    FROM parties p
    LEFT JOIN entries e ON e.party_id = p.id
    GROUP BY p.id
    ORDER BY p.name COLLATE NOCASE
  `).all();
  res.json(rows);
});

// get party ledger (month-wise)
app.get('/api/party/:id', (req, res) => {
  const id = req.params.id;
  const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(id);
  if (!party) return res.status(404).json({ error: 'party not found' });
  const entries = db.prepare('SELECT * FROM entries WHERE party_id = ? ORDER BY date DESC, id DESC').all(id);
  const balanceRow = db.prepare('SELECT IFNULL(SUM(credit),0) as credit, IFNULL(SUM(debit),0) as debit FROM entries WHERE party_id = ?').get(id);
  const balance = (balanceRow.credit || 0) - (balanceRow.debit || 0);
  res.json({ party, entries, balance });
});

// delete party
app.delete('/api/party/:id', (req, res) => {
  try {
    const id = req.params.id;

    // Optionally delete all entries of that party
    db.prepare("DELETE FROM entries WHERE party_id = ?").run(id);

    const result = db.prepare("DELETE FROM parties WHERE id = ?").run(id);

    if (result.changes > 0) {
      res.json({ ok: true });
    } else {
      res.status(404).json({ ok: false, error: "Party not found" });
    }
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ ok: false, error: "Failed to delete party" });
  }
});


// ----- ENTRIES -----
// add entry (on save: upsert party if not exists)
app.post('/api/entry', (req, res) => {
  const { date, partyName, purpose, debit, credit, reference, mobile, email } = req.body;
  if (!date || !partyName) return res.status(400).json({ error: 'date and partyName required' });

  const trx = db.transaction(() => {
    // ensure party exists
    let party = db.prepare('SELECT * FROM parties WHERE name = ?').get(partyName);
    if (!party) {
      const ins = db.prepare('INSERT INTO parties (name, mobile, email) VALUES (?,?,?)');
      ins.run(partyName, mobile || null, email || null);
      party = db.prepare('SELECT * FROM parties WHERE name = ?').get(partyName);
    } else {
      // update mobile/email if provided (optional)
      if (mobile || email) {
        db.prepare('UPDATE parties SET mobile = COALESCE(?, mobile), email = COALESCE(?, email) WHERE id = ?').run(mobile || null, email || null, party.id);
        party = db.prepare('SELECT * FROM parties WHERE id = ?').get(party.id);
      }
    }

    const insEntry = db.prepare(`
      INSERT INTO entries (date, party_id, party_name, purpose, debit, credit, reference)
      VALUES (?,?,?,?,?,?,?)
    `);
    insEntry.run(date, party.id, party.name, purpose || '', parseFloat(debit || 0), parseFloat(credit || 0), reference || '');

    return party;
  });

  try {
    const party = trx();
    res.json({ ok: true, party });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// monthly report (YYYY-MM) totals and listing
app.get('/api/month/:month', (req, res) => {
  const month = req.params.month;
  const rows = db.prepare(`
    SELECT date, party_name, purpose, debit, credit, reference
    FROM entries
    WHERE substr(date,1,7) = ?
    ORDER BY date ASC, id ASC
  `).all(month);

  const totals = db.prepare(`
    SELECT IFNULL(SUM(debit),0) as total_debit, IFNULL(SUM(credit),0) as total_credit
    FROM entries
    WHERE substr(date,1,7) = ?
  `).get(month);

  res.json({ month, rows, totals });
});

// get list of months with totals
app.get('/api/months', (req, res) => {
  const rows = db.prepare(`
    SELECT substr(date,1,7) as month,
      IFNULL(SUM(debit),0) as total_debit,
      IFNULL(SUM(credit),0) as total_credit
    FROM entries
    GROUP BY month
    ORDER BY month DESC
  `).all();
  res.json(rows);
});

// export month CSV
app.get('/api/export/month/:month/csv', async (req, res) => {
  const month = req.params.month;
  const rows = db.prepare(`
    SELECT date, party_name, purpose, debit, credit, reference
    FROM entries WHERE substr(date,1,7) = ? ORDER BY date
  `).all(month);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Month ' + month);
  sheet.addRow(['Date', 'Party', 'Purpose', 'Debit', 'Credit', 'Reference']);
  rows.forEach(r => sheet.addRow([r.date, r.party_name, r.purpose, r.debit, r.credit, r.reference]));
  const totals = db.prepare('SELECT IFNULL(SUM(debit),0) as debit, IFNULL(SUM(credit),0) as credit FROM entries WHERE substr(date,1,7) = ?').get(month);
  sheet.addRow([]);
  sheet.addRow(['', '', 'Totals', totals.debit, totals.credit]);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=month_${month}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

// export month PDF (simple)
app.get('/api/export/month/:month/pdf', (req, res) => {
  const month = req.params.month;
  const rows = db.prepare('SELECT date, party_name, purpose, debit, credit, reference FROM entries WHERE substr(date,1,7)=? ORDER BY date').all(month);
  const totals = db.prepare('SELECT IFNULL(SUM(debit),0) as debit, IFNULL(SUM(credit),0) as credit FROM entries WHERE substr(date,1,7) = ?').get(month);

  const doc = new PDFDocument({ margin: 30 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=month_${month}.pdf`);
  doc.pipe(res);

  doc.fontSize(18).text(`Monthly Report — ${month}`, { align: 'center' });
  doc.moveDown();

  // header
  doc.fontSize(10).text('Date | Party | Purpose | Debit | Credit | Reference');
  doc.moveDown(0.5);

  rows.forEach(r => {
    const line = `${r.date} | ${r.party_name} | ${r.purpose || '-'} | ${r.debit || 0} | ${r.credit || 0} | ${r.reference || ''}`;
    doc.text(line);
  });

  doc.moveDown();
  doc.text(`Totals — Debit: ${totals.debit}   Credit: ${totals.credit}`);

  doc.end();
});

// export party CSV
app.get('/api/export/party/:id/csv', async (req, res) => {
  const id = req.params.id;
  const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(id);
  if (!party) return res.status(404).send('Not found');
  const rows = db.prepare('SELECT date, purpose, debit, credit, reference FROM entries WHERE party_id = ? ORDER BY date').all(id);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Party ${party.name}`);
  sheet.addRow(['Date', 'Purpose', 'Debit', 'Credit', 'Reference']);
  rows.forEach(r => sheet.addRow([r.date, r.purpose, r.debit, r.credit, r.reference]));
  const totals = db.prepare('SELECT IFNULL(SUM(debit),0) as debit, IFNULL(SUM(credit),0) as credit FROM entries WHERE party_id = ?').get(id);
  sheet.addRow([]);
  sheet.addRow(['', 'Totals', totals.debit, totals.credit]);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=party_${party.name}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server listening on', PORT));
