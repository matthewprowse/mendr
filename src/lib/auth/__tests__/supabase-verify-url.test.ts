import { describe, it, expect } from 'vitest';
import { buildSupabaseVerifyUrl } from '@/lib/auth/supabase-verify-url';

describe('buildSupabaseVerifyUrl', () => {
    it('builds the verify URL with token and type query params', () => {
        const result = buildSupabaseVerifyUrl(
            'https://abc.supabase.co',
            'hash123',
            'signup',
            'https://app.example.com/confirmed'
        );
        const url = new URL(result);
        expect(url.origin).toBe('https://abc.supabase.co');
        expect(url.pathname).toBe('/auth/v1/verify');
        expect(url.searchParams.get('token')).toBe('hash123');
        expect(url.searchParams.get('type')).toBe('signup');
        expect(url.searchParams.get('redirect_to')).toBe('https://app.example.com/confirmed');
    });

    it('normalises a trailing slash on the supabase URL before composing', () => {
        const result = buildSupabaseVerifyUrl(
            'https://abc.supabase.co/',
            'hash123',
            'magiclink',
            'https://app.example.com/'
        );
        const url = new URL(result);
        // Base should not contain a doubled slash before /auth.
        expect(url.toString().startsWith('https://abc.supabase.co/auth/v1/verify')).toBe(true);
    });

    it('strips multiple trailing slashes from the supabase URL', () => {
        const result = buildSupabaseVerifyUrl(
            'https://abc.supabase.co///',
            't',
            'recovery',
            'https://app.example.com'
        );
        const url = new URL(result);
        expect(url.origin).toBe('https://abc.supabase.co');
        expect(url.pathname).toBe('/auth/v1/verify');
    });

    it('omits the redirect_to param when redirectTo is an empty string', () => {
        const result = buildSupabaseVerifyUrl('https://abc.supabase.co', 'tok', 'signup', '');
        const url = new URL(result);
        expect(url.searchParams.has('redirect_to')).toBe(false);
        expect(url.searchParams.get('token')).toBe('tok');
    });

    it('encodes special characters in the token and redirect target', () => {
        const result = buildSupabaseVerifyUrl(
            'https://abc.supabase.co',
            'a b+c',
            'email_change',
            'https://app.example.com/path?x=1&y=2'
        );
        const url = new URL(result);
        expect(url.searchParams.get('token')).toBe('a b+c');
        expect(url.searchParams.get('redirect_to')).toBe('https://app.example.com/path?x=1&y=2');
    });
});
