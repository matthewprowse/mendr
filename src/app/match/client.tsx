'use client';

import { MatchClient } from './components/client';

type MatchPageProps = {
    conversationId?: string;
};

export default function MatchPage({ conversationId }: MatchPageProps) {
    return <MatchClient conversationId={conversationId} />;
}

