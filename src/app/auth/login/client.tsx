'use client';

import { AuthLoginForm } from '@/components/auth/login-form';
import { BRAND_NAME } from '@/lib/brand-system';

export default function LoginClient() {
    return (
        <AuthLoginForm
            brandName={BRAND_NAME}
            defaultNext="/"
            registerPath="/auth/register"
            forgotPath="/auth/forgot"
        />
    );
}
