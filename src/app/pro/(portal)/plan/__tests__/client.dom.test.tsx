import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import PlanClient from '@/app/pro/(portal)/plan/client';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('sonner', () => ({ toast: toastMock }));

beforeEach(() => vi.clearAllMocks());

describe('PlanClient', () => {
    it('lists the three plans and marks the current one', () => {
        render(<PlanClient current="team" seatsUsed={3} canManage={false} />);
        expect(screen.getByText('Starter')).toBeInTheDocument();
        expect(screen.getByText('Team')).toBeInTheDocument();
        expect(screen.getByText('Business')).toBeInTheDocument();
        expect(screen.getByText('Current')).toBeInTheDocument();
    });

    it('hides switch controls and explains when the caller cannot manage', () => {
        render(<PlanClient current="starter" seatsUsed={1} canManage={false} />);
        expect(screen.queryByRole('button', { name: /switch to/i })).not.toBeInTheDocument();
        expect(screen.getByText(/only the owner can change the plan/i)).toBeInTheDocument();
    });

    it('shows switch buttons for non-current plans when manageable', () => {
        render(<PlanClient current="starter" seatsUsed={1} canManage />);
        expect(screen.getByRole('button', { name: /switch to team/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /switch to business/i })).toBeInTheDocument();
    });

    it('changes the plan and confirms with a toast', async () => {
        server.use(http.patch('/api/pro/plan', () => HttpResponse.json({ ok: true, plan: 'business' })));
        const user = userEvent.setup();
        render(<PlanClient current="starter" seatsUsed={1} canManage />);
        await user.click(screen.getByRole('button', { name: /switch to business/i }));
        await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('You are on the Business plan.'));
        expect(nav.refresh).toHaveBeenCalled();
    });

    it('shows an error toast when the change is rejected', async () => {
        server.use(http.patch('/api/pro/plan', () => HttpResponse.json({ error: 'Too many seats.' }, { status: 409 })));
        const user = userEvent.setup();
        render(<PlanClient current="business" seatsUsed={10} canManage />);
        await user.click(screen.getByRole('button', { name: /switch to starter/i }));
        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Too many seats.'));
    });
});
