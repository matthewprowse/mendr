import { META_SIGN_IN } from '@/lib/site-metadata';
import LoginClient from './client';

export const metadata = META_SIGN_IN;

export default function LoginPage() {
    return <LoginClient />;
}
