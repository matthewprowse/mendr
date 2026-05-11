import { META_REGISTER } from '@/lib/site-metadata';
import AuthRegisterClient from './client';

export const metadata = META_REGISTER;

export default function RegisterPage() {
    return <AuthRegisterClient />;
}
