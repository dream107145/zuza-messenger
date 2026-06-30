import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'database.sqlite');

console.log('🚀 [PHASE 1] Initializing production reset pipeline...');

try {
    console.log('🧹 [PHASE 2] Terminating connections and aggressively truncating SQLite memory state...');
    
    if (fs.existsSync(dbPath)) {
        const db = new Database(dbPath);
        // Aggressively delete all rows to guarantee a pristine state
        db.prepare('DELETE FROM messages').run();
        
        // Reset auto-increment sequence if it exists to eliminate ghost IDs
        try {
           db.prepare('DELETE FROM sqlite_sequence WHERE name="messages"').run();
        } catch (e) {
           // Sequence table may not exist yet, safe to ignore
        }
        
        // Explicitly close the connection to free filesystem locks
        db.close();
        console.log('✅ SQLite database purged. Conversational memory state is pristine.');
    } else {
        console.log('✅ SQLite database not found. State is already pristine.');
    }

    console.log('🔨 [PHASE 3] Triggering cache-busting recompilation via esbuild...');
    
    // Trigger the actual project build toolchain in the current directory
    execSync('node bundle.cjs', { stdio: 'inherit', cwd: __dirname });
    
    console.log('✅ Recompilation successful. Updated regex middleware and prompts compiled.');
    console.log('🎉 [PHASE 4] Pipeline complete. Extension bundle deployed without residual ghost artifacts.');
    
} catch (err) {
    console.error('❌ FATAL PIPELINE ERROR:', err.message);
    process.exit(1);
}
