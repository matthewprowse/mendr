/**
 * When the match page cannot read `conversations.diagnosis` from Supabase (RLS / network),
 * we still need trade + trade_detail for `/api/providers`. The diagnosis step writes this
 * snapshot before navigating to `/match/[id]`.
 */
export function matchTradeContextStorageKey(conversationId: string): string {
    return `match_trade_context:${conversationId}`;
}

export function writeMatchTradeContextStorage(
    conversationId: string,
    trade: string,
    tradeDetail?: string
): void {
    const t = (trade ?? '').trim();
    if (!t || t.toLowerCase() === 'n/a') return;
    const td = (tradeDetail ?? '').trim() || t;
    try {
        sessionStorage.setItem(
            matchTradeContextStorageKey(conversationId),
            JSON.stringify({ trade: t, trade_detail: td })
        );
    } catch {
        // ignore quota / private mode
    }
}

export function readMatchTradeContextStorage(conversationId: string): {
    trade: string;
    trade_detail: string;
} | null {
    if (!conversationId) return null;
    try {
        const raw = sessionStorage.getItem(matchTradeContextStorageKey(conversationId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { trade?: unknown; trade_detail?: unknown };
        const trade = typeof parsed.trade === 'string' ? parsed.trade.trim() : '';
        const tdRaw = typeof parsed.trade_detail === 'string' ? parsed.trade_detail.trim() : '';
        if (!trade || trade.toLowerCase() === 'n/a') return null;
        return { trade, trade_detail: tdRaw || trade };
    } catch {
        return null;
    }
}
