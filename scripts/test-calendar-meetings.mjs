import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
    ['migration creates implementation meetings', read('supabase/migrations/20260804185204_google_calendar_meetings.sql').includes('create table if not exists landlord.implementation_meetings')],
    ['migration enables RLS', read('supabase/migrations/20260804185204_google_calendar_meetings.sql').includes('enable row level security')],
    ['function requires support actor', read('supabase/functions/calendar-api/index.ts').includes("requireHelpdeskActor(request, 'support')")],
    ['calendar sends attendee updates', read('supabase/functions/calendar-api/index.ts').includes('events?sendUpdates=all')],
    ['calendar includes reminders', read('supabase/functions/calendar-api/index.ts').includes("{ method: 'email', minutes: 1440 }")],
    ['AI uses Responses API', read('supabase/functions/calendar-api/index.ts').includes("https://api.openai.com/v1/responses")],
    ['UI exposes calendar route', read('src/App.tsx').includes('path="calendario"')],
    ['workflow deploys function', read('.github/workflows/deploy-supabase-functions.yml').includes('functions deploy calendar-api')],
];

const failed = checks.filter(([, passed]) => !passed);
checks.forEach(([name, passed]) => console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`));
if (failed.length) process.exit(1);
