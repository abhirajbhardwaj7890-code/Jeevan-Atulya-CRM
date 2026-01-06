
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// --- CONFIGURATION ---
// Replace these with your actual Supabase URL and Anon Key
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    console.error("❌ ERROR: Please set your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables or edit this script.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runBackup() {
    console.log("🚀 Starting Local Backup...");

    try {
        const [
            { data: members },
            { data: accounts },
            { data: interactions },
            { data: settings },
            { data: ledger },
            { data: branches },
            { data: groups }
        ] = await Promise.all([
            supabase.from('members').select('*'),
            supabase.from('accounts').select('*'),
            supabase.from('interactions').select('*'),
            supabase.from('settings').select('*'),
            supabase.from('ledger').select('*'),
            supabase.from('branches').select('*'),
            supabase.from('member_groups').select('*')
        ]);

        const backupData = {
            timestamp: new Date().toISOString(),
            members,
            accounts,
            interactions,
            settings: settings?.[0] || {},
            ledger,
            branches,
            groups
        };

        const fileName = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const dir = './backups';

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }

        fs.writeFileSync(path.join(dir, fileName), JSON.stringify(backupData, null, 2));

        console.log(`✅ Backup successful! Saved to: ${path.join(dir, fileName)}`);
    } catch (error) {
        console.error("❌ Backup failed:", error);
    }
}

runBackup();
