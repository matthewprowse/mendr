import { META_FORGOT_PASSWORD } from '@/lib/site-metadata';
import AuthForgotClient from './client';

export const metadata = META_FORGOT_PASSWORD;

export default function ForgotPasswordPage() {
    return <AuthForgotClient />;
}
