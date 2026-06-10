'use client';

import { AuthRegisterForm } from '@/components/auth/register-form';
import { BRAND_NAME_PRO } from '@/lib/brand-system';

export default function ProRegisterClient() {
    return (
        <AuthRegisterForm
            brandName={BRAND_NAME_PRO}
            defaultNext="/pro/network"
            loginPath="/pro/auth/login"
            extraSignupMetadata={{ profile_type: 'pro' }}
        />
    );
}
