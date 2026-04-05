import type { Metadata } from 'next';
import ContactPageClient from './contact-page-client';

export const metadata: Metadata = {
    title: 'Contact',
    description: 'Get in touch with Scandio for homeowner, contractor, or partnership questions.',
};

export default function ContactPage() {
    return <ContactPageClient />;
}
