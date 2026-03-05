import type { Metadata } from 'next';
import { AppHomeClient } from './app-home-client';

export const metadata: Metadata = {
    title: 'Home | Scandio',
};

export default function AppHomePage() {
    return <AppHomeClient />;
}


