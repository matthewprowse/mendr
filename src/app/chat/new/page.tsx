import { redirect } from 'next/navigation';

export default function NewChatPage() {
    const id = crypto.randomUUID();
    redirect(`/chat/${id}`);
}

