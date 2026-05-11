import type { Metadata } from 'next';
import { Landing1Client } from './client';

export const metadata: Metadata = {
    title: 'Know What Is Wrong Before You Call Anyone | Menda',
    description:
        'Upload a photo of any home fault and get a free written diagnosis in under 60 seconds. Western Cape homeowners — plumbing, electrical, damp, roofing and more.',
};

export default function Landing1Page() {
    return <Landing1Client />;
}
