'use client';

import { AuthRegisterForm } from '@/components/auth/register-form';
import { BRAND_NAME } from '@/lib/brand-system';

export default function RegisterPage() {
    return (
        <AuthRegisterForm brandName={BRAND_NAME} defaultNext="/" loginPath="/auth/login" />
    );
}
