/**
 * Shared shapes for diagnosis records as projected into list/summary UIs.
 *
 * `DiagnosisListRow` is the canonical row used by the diagnosis history list
 * and the account dashboard summary. The account view reads a subset of these
 * fields; the extra fields (`customer_address`, `pinned`) are therefore
 * optional so both producers satisfy a single type.
 */
export type DiagnosisListRow = {
    id: string;
    title: string | null;
    created_at: string;
    diagnosis: {
        diagnosis?: string | null;
        trade?: string | null;
        trade_detail?: string | null;
    } | null;
    customer_address?: string | null;
    pinned?: boolean | null;
};
