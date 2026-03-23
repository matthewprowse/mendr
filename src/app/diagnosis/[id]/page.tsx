import type { Metadata } from 'next';

import DiagnosisPage from '../page';

type PageProps = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    return {
        title: id ? 'Diagnosis' : 'Diagnosis',
        description: '',
    };
}

export default async function DiagnosisIdPage(_props: PageProps) {
    // Intentionally reuse the existing `/diagnosis` page UI.
    // The current component is a client component; it ignores route params.
    const { id } = await _props.params;
    return <DiagnosisPage conversationId={id} />;
}

