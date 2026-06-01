import type { Metadata } from 'next';
import { WhatsappSimulator } from './simulator-client';

export const metadata: Metadata = {
    title: 'WhatsApp Simulator',
    robots: { index: false, follow: false },
};

export default function WhatsappSimulatorPage() {
    return <WhatsappSimulator />;
}
