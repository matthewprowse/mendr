import type { Metadata } from 'next';
import AuthForgotClient from './client';

export const metadata: Metadata = {
    title: 'Forgot password',
    description: 'Reset your Scandio account password.',
};

export default function ForgotPasswordPage() {
    return <AuthForgotClient />;
}
