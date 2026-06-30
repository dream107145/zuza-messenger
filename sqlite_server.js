import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 11435;
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

// Initialize table
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_name TEXT,
    role TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const insertMessage = db.prepare(`INSERT INTO messages (contact_name, role, message) VALUES (?, ?, ?)`);
const getMessages = db.prepare(`SELECT role, message FROM (SELECT * FROM messages WHERE contact_name = ? ORDER BY id DESC LIMIT 100) ORDER BY id ASC`);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // GET /memory?name=XXX
  if (req.method === 'GET' && req.url.startsWith('/memory')) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const name = url.searchParams.get('name');
    if (!name) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Missing name' }));
    }

    try {
      const rows = getMessages.all(name);
      // Map back to extension format
      const history = rows.map(row => ({
        role: row.role,
        parts: [{ text: row.message }]
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ history }));
    } catch (err) {
      console.error(err);
      res.writeHead(500);
      return res.end();
    }
  }

  // POST /memory
  if (req.method === 'POST' && req.url === '/memory') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { name, role, text } = payload;
        
        if (!name || !role || !text) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'Missing name, role, or text' }));
        }

        insertMessage.run(name, role, text);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error(err);
        res.writeHead(500);
        return res.end();
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🧠 SQLite Memory Server running at http://localhost:${PORT}`);
  console.log(`📂 Database file: ${dbPath}`);
});
