import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 11435;
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_name TEXT,
    role TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contact_meta (
    contact_name TEXT PRIMARY KEY,
    first_contact_at DATETIME,
    message_count INTEGER DEFAULT 0,
    facts TEXT DEFAULT '[]',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const insertMessage = db.prepare(`INSERT INTO messages (contact_name, role, message) VALUES (?, ?, ?)`);
const getMessages = db.prepare(`SELECT role, message FROM (SELECT * FROM messages WHERE contact_name = ? ORDER BY id DESC LIMIT 100) ORDER BY id ASC`);
const getContactMeta = db.prepare(`SELECT contact_name, first_contact_at, message_count, facts FROM contact_meta WHERE contact_name = ?`);
const upsertContactMeta = db.prepare(`
  INSERT INTO contact_meta (contact_name, first_contact_at, message_count, facts, updated_at)
  VALUES (@contact_name, @first_contact_at, @message_count, @facts, CURRENT_TIMESTAMP)
  ON CONFLICT(contact_name) DO UPDATE SET
    first_contact_at = COALESCE(excluded.first_contact_at, contact_meta.first_contact_at),
    message_count = CASE
      WHEN excluded.message_count > 0 THEN excluded.message_count
      ELSE contact_meta.message_count
    END,
    facts = CASE
      WHEN excluded.facts IS NOT NULL AND excluded.facts != '[]' THEN excluded.facts
      ELSE contact_meta.facts
    END,
    updated_at = CURRENT_TIMESTAMP
`);
const incrementUserMessageCount = db.prepare(`
  INSERT INTO contact_meta (contact_name, first_contact_at, message_count, facts, updated_at)
  VALUES (?, CURRENT_TIMESTAMP, 1, '[]', CURRENT_TIMESTAMP)
  ON CONFLICT(contact_name) DO UPDATE SET
    message_count = contact_meta.message_count + 1,
    updated_at = CURRENT_TIMESTAMP
`);
const getEarliestMessageAt = db.prepare(`
  SELECT MIN(created_at) AS first_at FROM messages WHERE contact_name = ?
`);

function parseFacts(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeFacts(existingFacts, incomingFacts) {
  const map = new Map();
  for (const fact of [...existingFacts, ...incomingFacts]) {
    if (typeof fact !== 'string') continue;
    const idx = fact.indexOf(':');
    if (idx <= 0) continue;
    const key = fact.slice(0, idx).trim().toLowerCase();
    map.set(key, fact);
  }
  return Array.from(map.values()).slice(-12);
}

function ensureFirstContactAt(contactName) {
  const row = getContactMeta.get(contactName);
  if (row?.first_contact_at) return;

  const earliest = getEarliestMessageAt.get(contactName);
  const firstAt = earliest?.first_at || new Date().toISOString();
  upsertContactMeta.run({
    contact_name: contactName,
    first_contact_at: firstAt,
    message_count: row?.message_count || 0,
    facts: row?.facts || '[]',
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'GET' && req.url.startsWith('/memory')) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const name = url.searchParams.get('name');
    if (!name) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Missing name' }));
    }

    try {
      const rows = getMessages.all(name);
      const history = rows.map((row) => ({
        role: row.role,
        parts: [{ text: row.message }],
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ history }));
    } catch (err) {
      console.error(err);
      res.writeHead(500);
      return res.end();
    }
  }

  if (req.method === 'GET' && req.url.startsWith('/contact')) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const name = url.searchParams.get('name');
    if (!name) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Missing name' }));
    }

    try {
      ensureFirstContactAt(name);
      const row = getContactMeta.get(name);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        contact_name: name,
        first_contact_at: row?.first_contact_at || null,
        message_count: row?.message_count || 0,
        facts: parseFacts(row?.facts),
      }));
    } catch (err) {
      console.error(err);
      res.writeHead(500);
      return res.end();
    }
  }

  if (req.method === 'POST' && req.url === '/contact') {
    try {
      const payload = await readJsonBody(req);
      const { name, first_contact_at, message_count, facts } = payload;

      if (!name) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Missing name' }));
      }

      const existing = getContactMeta.get(name);
      const mergedFacts = Array.isArray(facts)
        ? mergeFacts(parseFacts(existing?.facts), facts)
        : parseFacts(existing?.facts);

      upsertContactMeta.run({
        contact_name: name,
        first_contact_at: first_contact_at || existing?.first_contact_at || null,
        message_count: typeof message_count === 'number' ? message_count : (existing?.message_count || 0),
        facts: JSON.stringify(mergedFacts),
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error(err);
      res.writeHead(500);
      return res.end();
    }
  }

  if (req.method === 'POST' && req.url === '/memory') {
    try {
      const payload = await readJsonBody(req);
      const { name, role, text } = payload;

      if (!name || !role || !text) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Missing name, role, or text' }));
      }

      insertMessage.run(name, role, text);
      ensureFirstContactAt(name);

      if (role === 'user') {
        incrementUserMessageCount.run(name);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error(err);
      res.writeHead(500);
      return res.end();
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🧠 SQLite Memory Server running at http://localhost:${PORT}`);
  console.log(`📂 Database file: ${dbPath}`);
});
