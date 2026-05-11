import { META_SIGN_IN } from '@/lib/site-metadata';
import AuthLoginClient from './client';

export const metadata = META_SIGN_IN;

export default function AuthPage() {
    return <AuthLoginClient />;
}
