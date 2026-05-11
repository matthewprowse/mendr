import CostPageClient from './page-client';

type PageProps = {
    params: Promise<{ id: string }>;
};

export default async function DiagnosisCostPage({ params }: PageProps) {
    const { id } = await params;
    return <CostPageClient conversationId={id} />;
}
