import type { Metadata } from 'next';
import AuthLoginClient from './auth-login-client';

export const metadata: Metadata = {
    title: 'Sign in',
    description: 'Sign in to your Scandio account.',
};

export default function AuthPage() {
    return <AuthLoginClient />;
}
