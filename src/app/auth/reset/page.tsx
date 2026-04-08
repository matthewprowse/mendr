import type { Metadata } from 'next';
import AuthResetClient from './client';

export const metadata: Metadata = {
    title: 'Reset password',
    description: 'Choose a new password for your Scandio account.',
};

export default function ResetPasswordPage() {
    return <AuthResetClient />;
}
