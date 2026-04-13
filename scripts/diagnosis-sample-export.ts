/**
 * Offline helper: export a CSV sample of rows from `diagnoses` for manual confidence review.
 * Run from app/: `npx tsx scripts/diagnosis-sample-export.ts`
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (or .env.local).
 */
import 'dotenv/config';

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        // eslint-disable-next-line no-console
        console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(url, key);
    const limit = Math.min(100, Number(process.env.SAMPLE_LIMIT || 50) || 50);
    const { data, error } = await admin
        .from('diagnoses')
        .select('id, image_url, diagnosis, created_at')
        .not('diagnosis', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) {
        // eslint-disable-next-line no-console
        console.error(error.message);
        process.exit(1);
    }
    const rows = Array.isArray(data) ? data : [];
    // eslint-disable-next-line no-console
    console.log('id,created_at,confidence,requires_clarification,prompt_version');
    for (const row of rows) {
        const d = row.diagnosis as Record<string, unknown> | null;
        const conf = typeof d?.confidence === 'number' ? d.confidence : '';
        const rc = d?.requires_clarification === true ? 'true' : 'false';
        const pv = typeof d?.prompt_version === 'string' ? d.prompt_version : '';
        // eslint-disable-next-line no-console
        console.log(
            `${row.id},${row.created_at ?? ''},${conf},${rc},${pv}`
        );
    }
}

main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
});
