import { META_MOBILE } from '@/lib/site-metadata';
import OpenOnPhonePageClient from './client';

export const metadata = META_MOBILE;

export default function OpenOnPhonePage() {
    return <OpenOnPhonePageClient />;
}
