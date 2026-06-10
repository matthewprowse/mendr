import * as React from 'react';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import {
    MendrAuthEmail,
    authEmailText,
    type MendrAuthEmailProps,
} from '@/lib/email/templates/auth';
import { buildSupabaseVerifyUrl } from '@/lib/auth/supabase-verify-url';

export interface AuthHookUser {
    id: string;
    email: string;
    user_metadata?: Record<string, unknown>;
    new_email?: string;
}

export interface AuthHookEmailData {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new: string;
    token_hash_new: string;
    old_email?: string;
    new_email?: string;
}

export interface AuthHookPayload {
    user: AuthHookUser;
    email_data: AuthHookEmailData;
}

async function sendHtml(
    to: string,
    subject: string,
    html: string,
    text: string,
    fromEmail: string,
    fromName: string
) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY not set');
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
        to,
        from: `${fromName} <${fromEmail}>`,
        subject,
        html,
        text,
    });
    if (error) throw new Error(error.message);
}

async function renderAuthEmail(props: MendrAuthEmailProps) {
    return render(<MendrAuthEmail {...props} />);
}

export async function dispatchAuthEmails(
    payload: AuthHookPayload,
    supabaseUrl: string,
    fromEmail: string,
    fromName: string
): Promise<void> {
    const { user, email_data: d } = payload;
    const firstName =
        typeof user.user_metadata?.first_name === 'string' ? user.user_metadata.first_name.trim() : '';

    async function sendOne(to: string, subject: string, content: MendrAuthEmailProps) {
        const html = await renderAuthEmail(content);
        const text = authEmailText(content);
        await sendHtml(to, subject, html, text, fromEmail, fromName);
    }

    const greet = firstName ? `Hi ${firstName},` : 'Hi,';
    const type = d.email_action_type;

    const hasDualEmailChange =
        Boolean(d.token_new && d.token_hash && d.token && d.token_hash_new) &&
        Boolean(user.new_email || d.new_email);

    switch (type) {
        case 'signup': {
            const url = buildSupabaseVerifyUrl(supabaseUrl, d.token_hash, 'signup', d.redirect_to);
            await sendOne(user.email, 'Confirm your Mendr account', {
                preview: 'Confirm your email to finish signing up.',
                heading: 'Confirm your email',
                body: `${greet}\n\nUse the button below to confirm your account and start using Mendr.`,
                ctaUrl: url,
                ctaLabel: 'Confirm email',
                otp: d.token || undefined,
            });
            return;
        }
        case 'magiclink': {
            const url = buildSupabaseVerifyUrl(supabaseUrl, d.token_hash, 'magiclink', d.redirect_to);
            await sendOne(user.email, 'Your Mendr sign-in link', {
                preview: 'Sign in to Mendr with one click.',
                heading: 'Sign in to Mendr',
                body: `${greet}\n\nClick the button below to sign in. This link expires soon for your security.`,
                ctaUrl: url,
                ctaLabel: 'Sign in',
                otp: d.token || undefined,
            });
            return;
        }
        case 'recovery': {
            const url = buildSupabaseVerifyUrl(supabaseUrl, d.token_hash, 'recovery', d.redirect_to);
            await sendOne(user.email, 'Reset your Mendr password', {
                preview: 'Reset your Mendr password.',
                heading: 'Password reset',
                body: `${greet}\n\nWe received a request to reset your password. Choose a new password using the link below.`,
                ctaUrl: url,
                ctaLabel: 'Reset password',
                otp: d.token || undefined,
            });
            return;
        }
        case 'invite': {
            const url = buildSupabaseVerifyUrl(supabaseUrl, d.token_hash, 'invite', d.redirect_to);
            await sendOne(user.email, "You're invited to Mendr", {
                preview: 'Accept your invitation to Mendr.',
                heading: 'You’re invited',
                body: `${greet}\n\nYou’ve been invited to join Mendr. Accept the invitation to create your account.`,
                ctaUrl: url,
                ctaLabel: 'Accept invitation',
                otp: d.token || undefined,
            });
            return;
        }
        case 'email_change': {
            const newEmail = user.new_email || d.new_email;

            if (hasDualEmailChange && newEmail) {
                const urlCurrent = buildSupabaseVerifyUrl(
                    supabaseUrl,
                    d.token_hash_new,
                    'email_change',
                    d.redirect_to
                );
                await sendOne(user.email, 'Confirm your email change on Mendr', {
                    preview: 'Confirm changing your Mendr email.',
                    heading: 'Confirm on your current email',
                    body: `${greet}\n\nYou asked to change the email on your Mendr account. Confirm from this address first using the button below.`,
                    ctaUrl: urlCurrent,
                    ctaLabel: 'Confirm email change',
                    otp: d.token || undefined,
                });

                const urlNew = buildSupabaseVerifyUrl(
                    supabaseUrl,
                    d.token_hash,
                    'email_change',
                    d.redirect_to
                );
                await sendOne(newEmail, 'Confirm your new Mendr email', {
                    preview: 'Confirm your new Mendr email address.',
                    heading: 'Confirm your new email',
                    body: 'Hi,\n\nConfirm this address to complete the email change on your Mendr account.',
                    ctaUrl: urlNew,
                    ctaLabel: 'Confirm new email',
                    otp: d.token_new || undefined,
                });
                return;
            }

            const target = newEmail || user.email;
            const hash = d.token_hash || d.token_hash_new;
            const otp = d.token_new || d.token;
            const url = buildSupabaseVerifyUrl(supabaseUrl, hash, 'email_change', d.redirect_to);
            await sendOne(target, 'Confirm your Mendr email change', {
                preview: 'Confirm your new Mendr email.',
                heading: 'Confirm email change',
                body: `${greet}\n\nConfirm your updated email for Mendr using the link below.`,
                ctaUrl: url,
                ctaLabel: 'Confirm email',
                otp: otp || undefined,
            });
            return;
        }
        case 'reauthentication': {
            await sendOne(user.email, 'Your Mendr verification code', {
                preview: 'Your verification code for Mendr.',
                heading: 'Verify it’s you',
                body: `${greet}\n\nUse this code to continue with a sensitive action in Mendr.`,
                otp: d.token || undefined,
                footer: 'If you did not attempt this, secure your account by changing your password.',
            });
            return;
        }
        case 'email': {
            const url = buildSupabaseVerifyUrl(supabaseUrl, d.token_hash, 'email', d.redirect_to);
            await sendOne(user.email, 'Confirm your Mendr email', {
                preview: 'Mendr email verification.',
                heading: 'Verify your email',
                body: `${greet}\n\nComplete email verification for your Mendr account.`,
                ctaUrl: url,
                ctaLabel: 'Verify email',
                otp: d.token || undefined,
            });
            return;
        }
        case 'password_changed_notification':
            await sendOne(user.email, 'Your Mendr password was changed', {
                preview: 'Password updated.',
                heading: 'Password changed',
                body: `${greet}\n\nYour Mendr password was just changed. If this wasn’t you, reset your password and contact support immediately.`,
                footer: '',
            });
            return;
        case 'email_changed_notification':
            await sendOne(user.email, 'Your Mendr email was changed', {
                preview: 'Email updated.',
                heading: 'Email address changed',
                body: `${greet}\n\nThe email on your Mendr account was updated. If this wasn’t you, contact support right away.`,
                footer: '',
            });
            return;
        case 'phone_changed_notification':
            await sendOne(user.email, 'Your Mendr phone number was changed', {
                preview: 'Phone updated.',
                heading: 'Phone number changed',
                body: `${greet}\n\nThe phone number on your Mendr account was updated.`,
                footer: '',
            });
            return;
        case 'identity_linked_notification':
            await sendOne(user.email, 'A sign-in method was linked to Mendr', {
                preview: 'New sign-in method.',
                heading: 'New sign-in provider linked',
                body: `${greet}\n\nA new sign-in method was linked to your Mendr account.`,
                footer: '',
            });
            return;
        case 'identity_unlinked_notification':
            await sendOne(user.email, 'A sign-in method was removed from Mendr', {
                preview: 'Sign-in method removed.',
                heading: 'Sign-in provider removed',
                body: `${greet}\n\nA sign-in method was removed from your Mendr account.`,
                footer: '',
            });
            return;
        case 'mfa_factor_enrolled_notification':
            await sendOne(user.email, 'Two-step verification enabled on Mendr', {
                preview: 'MFA enabled.',
                heading: 'Extra security turned on',
                body: `${greet}\n\nTwo-step verification was enabled on your Mendr account.`,
                footer: '',
            });
            return;
        case 'mfa_factor_unenrolled_notification':
            await sendOne(user.email, 'Two-step verification updated on Mendr', {
                preview: 'MFA updated.',
                heading: 'Extra security updated',
                body: `${greet}\n\nTwo-step verification on your Mendr account was changed.`,
                footer: '',
            });
            return;
        default: {
            const url =
                d.token_hash &&
                buildSupabaseVerifyUrl(supabaseUrl, d.token_hash, type, d.redirect_to);
            await sendOne(user.email, 'Mendr account notification', {
                preview: 'Mendr account activity.',
                heading: 'Account notification',
                body: `${greet}\n\nThere is an update related to your Mendr account (${type}).`,
                ctaUrl: url || undefined,
                ctaLabel: url ? 'Continue' : undefined,
                otp: d.token || undefined,
            });
        }
    }
}
