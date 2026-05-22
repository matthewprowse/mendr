import { Playfair_Display } from 'next/font/google';

export const playfair = Playfair_Display({
    subsets: ['latin'],
    variable: '--font-playfair',
    display: 'swap',
    weight: ['400', '700'],
    style: ['normal', 'italic'],
});
