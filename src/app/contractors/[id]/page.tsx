import { notFound } from 'next/navigation';
import ContractorClient from './components/contractor-client';
import { loadContractorProfileById } from '@/lib/contractor-profile-server';

type PageProps = {
    params: Promise<{ id: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pickPlaceIdQuery(sp: Record<string, string | string[] | undefined>): string {
    const raw = sp.placeId;
    if (Array.isArray(raw)) return (raw[0] ?? '').trim();
    if (typeof raw === 'string') return raw.trim();
    return '';
}

export default async function ContractorByIdPage({ params, searchParams }: PageProps) {
    const { id: rawPathId } = await params;
    const sp = await searchParams;
    const pathSegment = decodeURIComponent(rawPathId ?? '').trim();
    const placeIdParam = pickPlaceIdQuery(sp);
    const fetchKey = (placeIdParam || pathSegment).trim();

    if (!fetchKey) {
        return (
            <ContractorClient
                key="__empty__"
                initialContractor={null}
                initialServerError="Missing contractor id."
                ssrFetchKey=""
            />
        );
    }

    const result = await loadContractorProfileById(fetchKey);

    if (result.status === 'not_found') {
        notFound();
    }

    if (result.status === 'bad_request') {
        return (
            <ContractorClient
                key={fetchKey}
                initialContractor={null}
                initialServerError="Invalid request."
                ssrFetchKey={fetchKey}
            />
        );
    }

    if (result.status === 'error') {
        return (
            <ContractorClient
                key={fetchKey}
                initialContractor={null}
                initialServerError={result.message}
                ssrFetchKey={fetchKey}
            />
        );
    }

    return (
        <ContractorClient
            key={fetchKey}
            initialContractor={{
                fetchKey,
                profile: result.profile,
                leakDetected: result.leakDetected,
            }}
            initialServerError={null}
            ssrFetchKey={fetchKey}
        />
    );
}
