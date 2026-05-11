import { META_DIAGNOSIS_INDEX } from '@/lib/site-metadata';
import DiagnosisPageClient from './client';

export const metadata = META_DIAGNOSIS_INDEX;

export default function DiagnosisIndexPage() {
    return <DiagnosisPageClient />;
}
