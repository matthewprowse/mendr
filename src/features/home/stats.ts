import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

export type PlatformHomeStats = {
    committed_total: number;
    first_pass_correct: number;
    first_pass_pct: number;
    avg_confidence: number;
    trades_covered: number;
    providers_active: number;
};

export type TradeCount = { trade: string; count: number };

export type RecentDiagnosis = {
    id: string;
    title: string;
    trade: string | null;
    customer_address: string | null;
    created_at: string;
};

export type UserHomeStats = {
    total: number;
    committed_total: number;
    first_pass_correct: number;
    first_pass_pct: number;
    by_trade: TradeCount[];
    recent: RecentDiagnosis | null;
};

/** Raw shape for rendering history-style diagnosis cards on the home page. */
export type DiagnosisCardRow = {
    id: string;
    title: string | null;
    diagnosis: {
        diagnosis?: string | null;
        trade?: string | null;
        trade_detail?: string | null;
    } | null;
    customer_address: string | null;
    created_at: string;
};

/** The N most recent diagnoses for a user, in the same shape the History list uses. */
export async function getRecentDiagnoses(userId: string, limit = 3): Promise<DiagnosisCardRow[]> {
    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('diagnoses')
        .select('id, title, diagnosis, customer_address, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
    return (data ?? []) as DiagnosisCardRow[];
}

export type SeriesPoint = { label: string; count: number };

/** Three time ranges for the Activities chart: last 7 days, last 30 days, last 6 months. */
export type DiagnosesSeries = {
    week: SeriesPoint[];
    month: SeriesPoint[];
    sixMonths: SeriesPoint[];
};

/**
 * Number of diagnoses bucketed for each of the chart's time ranges, zero-filled:
 * - week: last 7 days, daily (weekday labels)
 * - month: last 30 days, daily (day-of-month labels)
 * - sixMonths: last 6 calendar months, monthly (month labels)
 * Bucketed in JS off raw created_at timestamps in one fetch.
 */
export async function getDiagnosesSeries(userId: string): Promise<DiagnosesSeries> {
    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('diagnoses')
        .select('created_at')
        .eq('user_id', userId);

    const dates = (data ?? [])
        .map((r) => new Date((r as { created_at: string }).created_at))
        .filter((d) => !Number.isNaN(d.getTime()));
    const now = new Date();

    const daily = (days: number, label: (d: Date) => string): SeriesPoint[] => {
        const buckets: SeriesPoint[] = [];
        const indexByKey = new Map<string, number>();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            indexByKey.set(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, buckets.length);
            buckets.push({ label: label(d), count: 0 });
        }
        for (const d of dates) {
            const idx = indexByKey.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
            if (idx !== undefined) buckets[idx].count += 1;
        }
        return buckets;
    };

    const monthly = (months: number): SeriesPoint[] => {
        const buckets: SeriesPoint[] = [];
        const indexByKey = new Map<string, number>();
        for (let i = months - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            indexByKey.set(`${d.getFullYear()}-${d.getMonth()}`, buckets.length);
            buckets.push({ label: d.toLocaleDateString('en-ZA', { month: 'short' }), count: 0 });
        }
        for (const d of dates) {
            const idx = indexByKey.get(`${d.getFullYear()}-${d.getMonth()}`);
            if (idx !== undefined) buckets[idx].count += 1;
        }
        return buckets;
    };

    return {
        week: daily(7, (d) => d.toLocaleDateString('en-ZA', { weekday: 'short' })),
        month: daily(30, (d) => String(d.getDate())),
        sixMonths: monthly(6),
    };
}

const EMPTY_PLATFORM: PlatformHomeStats = {
    committed_total: 0,
    first_pass_correct: 0,
    first_pass_pct: 0,
    avg_confidence: 0,
    trades_covered: 0,
    providers_active: 0,
};

const EMPTY_USER: UserHomeStats = {
    total: 0,
    committed_total: 0,
    first_pass_correct: 0,
    first_pass_pct: 0,
    by_trade: [],
    recent: null,
};

/**
 * Fetches both the platform-wide trust stats and the signed-in user's personal
 * activity in one round-trip. Both come from SQL functions that own the
 * "first-pass" definition, so the two sections stay consistent. Failures
 * degrade to empty stats rather than throwing — the home page must still render.
 */
export async function getHomeStats(userId: string): Promise<{
    platform: PlatformHomeStats;
    user: UserHomeStats;
}> {
    const admin = await createSupabaseAdminClient();
    const [platformRes, userRes] = await Promise.all([
        admin.rpc('platform_home_stats'),
        admin.rpc('user_home_stats', { p_user_id: userId }),
    ]);

    // trades_covered now comes pre-computed from the canonical `primary_trade`
    // column inside platform_home_stats(); no read-time mapping needed.
    return {
        platform: { ...EMPTY_PLATFORM, ...((platformRes.data as Partial<PlatformHomeStats>) ?? {}) },
        user: { ...EMPTY_USER, ...((userRes.data as Partial<UserHomeStats>) ?? {}) },
    };
}
