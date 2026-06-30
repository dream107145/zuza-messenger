import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'database.sqlite');

try {
  const db = new Database(dbPath);
  db.prepare('DELETE FROM messages').run();
  console.log('✅ Success: All memory has been completely wiped from database.sqlite!');
} catch (err) {
  console.error('❌ Failed to wipe memory:', err.message);
}
