import { ProProviderClientPage } from './pro-provider-client-page';

type ProByIdPageProps = {
    params: { id: string };
};

export default function ProByIdPage({ params }: ProByIdPageProps) {
    const { id } = params;
    return <ProProviderClientPage providerId={id} />;
}
