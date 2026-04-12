'use client';

import { MatchClient } from './_components/match-client';

type MatchPageProps = {
    conversationId?: string;
};

export default function MatchPage({ conversationId }: MatchPageProps) {
    return <MatchClient conversationId={conversationId} />;
}

