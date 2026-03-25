'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

import { Moon, Sun } from 'lucide-react';

function getInitialTheme(): 'light' | 'dark' {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle() {
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const initial = getInitialTheme();
        setTheme(initial);
        document.documentElement.classList.toggle('dark', initial === 'dark');
        setMounted(true);
    }, []);

    function toggle() {
        const next = theme === 'light' ? 'dark' : 'light';
        setTheme(next);
        document.documentElement.classList.toggle('dark', next === 'dark');
    }

    // Render a stable placeholder before mount so there's no layout shift
    return (
        <Button
            type="button"
            variant="ghost"
            onClick={toggle}
            className="h-10 w-10"
        >
            {mounted ? (
                theme === 'light' ? (
                    <Moon className="size-5" />
                ) : (
                    <Sun className="size-5" />
                )
            ) : (
                <span />
            )}
        </Button>
    );
}
