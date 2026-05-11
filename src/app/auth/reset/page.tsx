import { META_RESET_PASSWORD } from '@/lib/site-metadata';
import AuthResetClient from './client';

export const metadata = META_RESET_PASSWORD;

export default function ResetPasswordPage() {
    return <AuthResetClient />;
}
