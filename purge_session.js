import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'database.sqlite');

const targetSession = process.argv[2];

if (!targetSession) {
    console.error("❌ Error: You must provide a target session (contact name) to purge.");
    console.log("Usage: npm run purge-session \"Paweł\"");
    process.exit(1);
}

try {
    const db = new Database(dbPath);
    const stmt = db.prepare('DELETE FROM messages WHERE contact_name = ?');
    const info = stmt.run(targetSession);
    
    if (info.changes > 0) {
        console.log(`✅ Success: Purged ${info.changes} anomalous messages for session: "${targetSession}"`);
    } else {
        console.log(`⚠️ Warning: No messages found for session: "${targetSession}". Nothing was deleted.`);
    }
    
    db.close();
} catch (err) {
    console.error("❌ FATAL SQL ERROR:", err.message);
}
