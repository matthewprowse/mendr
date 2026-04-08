import type { Metadata } from 'next';
import AuthRegisterClient from './client';

export const metadata: Metadata = {
    title: 'Create account',
    description: 'Create your free Scandio account.',
};

export default function RegisterPage() {
    return <AuthRegisterClient />;
}
