'use client';

import { AuthLoginForm } from '@/components/auth/login-form';
import { BRAND_NAME_PRO } from '@/lib/brand-system';

export default function ProLoginClient() {
    return (
        <AuthLoginForm
            brandName={BRAND_NAME_PRO}
            defaultNext="/pro/network"
            registerPath="/pro/auth/register"
            forgotPath="/pro/auth/forgot"
        />
    );
}
