import { redirect } from 'next/navigation';

/** /contact has been removed. Contact form now lives on /landing1#contact. */
export default function ContactPage() {
    redirect('/landing1#contact');
}
