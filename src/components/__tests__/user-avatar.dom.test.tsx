/**
 * Tests for `UserAvatar` initials derivation. The component reads the auth user
 * and falls back through several metadata shapes to produce two-letter (or
 * one-letter) initials. Auth is mocked; we assert the rendered fallback text.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock('@/context/auth-context', () => ({ useAuth: mocks.useAuth }));

import { UserAvatar } from '@/components/user-avatar';

function setUser(meta: Record<string, string> | null, email?: string) {
    mocks.useAuth.mockReturnValue({
        user: meta === null && !email ? null : ({ user_metadata: meta ?? {}, email } as unknown as User),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('UserAvatar', () => {
    it('renders nothing when no user is signed in', () => {
        setUser(null);
        const { container } = render(<UserAvatar />);
        expect(container).toBeEmptyDOMElement();
    });

    it('uses first_name + surname initials', () => {
        setUser({ first_name: 'Sipho', surname: 'Dlamini' });
        render(<UserAvatar />);
        expect(screen.getByText('SD')).toBeInTheDocument();
    });

    it('uses Google given_name + family_name as a fallback for initials', () => {
        setUser({ given_name: 'Thandi', family_name: 'Mokoena' });
        render(<UserAvatar />);
        expect(screen.getByText('TM')).toBeInTheDocument();
    });

    it('derives initials from a full name when no first/last split exists', () => {
        setUser({ name: 'John Quincy Adams' });
        render(<UserAvatar />);
        // first initial + last initial.
        expect(screen.getByText('JA')).toBeInTheDocument();
    });

    it('uses a single initial for a one-word full name', () => {
        setUser({ full_name: 'Cher' });
        render(<UserAvatar />);
        expect(screen.getByText('C')).toBeInTheDocument();
    });

    it('falls back to the first letter of the email as a last resort', () => {
        setUser({}, 'matthew@example.com');
        render(<UserAvatar />);
        expect(screen.getByText('M')).toBeInTheDocument();
    });
});
