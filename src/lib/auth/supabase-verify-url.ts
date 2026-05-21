/**
 * Build the same confirmation / magic-link URL Supabase would embed in its default emails.
 * @see https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
 */
export function buildSupabaseVerifyUrl(
    supabaseUrl: string,
    tokenHash: string,
    emailActionType: string,
    redirectTo: string
): string {
    const base = supabaseUrl.replace(/\/+$/, '');
    const url = new URL(`${base}/auth/v1/verify`);
    url.searchParams.set('token', tokenHash);
    url.searchParams.set('type', emailActionType);
    if (redirectTo) url.searchParams.set('redirect_to', redirectTo);
    return url.toString();
}
