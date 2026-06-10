import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/msw/server';
import SettingsClient, {
    type ProfileSettings,
    type NotificationSettings,
} from '@/app/pro/(portal)/settings/client';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const profile: ProfileSettings = {
    insurance_cover: '',
    typical_response_time: '',
    pricing_model: '',
    callout_fee: null,
    preferred_contact_channel: '',
    notify_realtime: false,
};
const notifications: NotificationSettings = {
    new_enquiry: true,
    new_review: true,
    weekly_summary: false,
    quiet_hours_start: null,
    quiet_hours_end: null,
    preferred_channel: 'email',
};

function setup(canEditProfile: boolean) {
    return render(
        <SettingsClient profile={profile} notifications={notifications} canEditProfile={canEditProfile} />,
    );
}

beforeEach(() => vi.clearAllMocks());

describe('SettingsClient', () => {
    it('disables the profile fields and hides Save for non-managers', () => {
        setup(false);
        expect(screen.getByText(/only owners and admins can edit/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/insurance cover/i)).toBeDisabled();
        expect(screen.queryByRole('button', { name: /save profile/i })).not.toBeInTheDocument();
        // Notifications remain editable for any teammate.
        expect(screen.getByRole('button', { name: /save notifications/i })).toBeInTheDocument();
    });

    it('lets a manager edit and save the business profile', async () => {
        server.use(http.patch('/api/pro/settings', () => HttpResponse.json({ ok: true })));
        const user = userEvent.setup();
        setup(true);
        await user.type(screen.getByLabelText(/insurance cover/i), 'R5m public liability');
        await user.click(screen.getByRole('button', { name: /save profile/i }));
        await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Saved.'));
    });

    it('surfaces a profile save error', async () => {
        server.use(http.patch('/api/pro/settings', () => HttpResponse.json({ error: 'Forbidden.' }, { status: 403 })));
        const user = userEvent.setup();
        setup(true);
        await user.click(screen.getByRole('button', { name: /save profile/i }));
        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Forbidden.'));
    });

    it('saves notification preferences for any teammate', async () => {
        server.use(http.patch('/api/pro/settings', () => HttpResponse.json({ ok: true })));
        const user = userEvent.setup();
        setup(false);
        await user.selectOptions(screen.getByLabelText(/preferred channel/i), 'sms');
        await user.click(screen.getByRole('button', { name: /save notifications/i }));
        await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Saved.'));
    });
});
