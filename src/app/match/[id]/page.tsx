import MatchPage from '../page';

type PageProps = {
    params: Promise<{ id: string }>;
};

export default async function MatchByIdPage({ params }: PageProps) {
    const { id } = await params;
    return <MatchPage conversationId={id} />;
}
