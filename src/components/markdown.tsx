import ReactMarkdown from 'react-markdown';

import { cn } from '@/lib/utils';

/**
 * Lightweight markdown renderer for short-form content (announcements, notes).
 * Styles each element with app tokens directly — the project does not include
 * the Tailwind typography (`prose`) plugin.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
    return (
        <div className={cn('flex flex-col gap-4 text-sm leading-relaxed text-foreground', className)}>
            <ReactMarkdown
                components={{
                    h1: ({ node, ...props }) => (
                        <h1 className="text-xl font-semibold text-foreground" {...props} />
                    ),
                    h2: ({ node, ...props }) => (
                        <h2 className="text-lg font-semibold text-foreground" {...props} />
                    ),
                    h3: ({ node, ...props }) => (
                        <h3 className="text-base font-semibold text-foreground" {...props} />
                    ),
                    p: ({ node, ...props }) => <p {...props} />,
                    ul: ({ node, ...props }) => (
                        <ul className="flex list-disc flex-col gap-1 pl-5" {...props} />
                    ),
                    ol: ({ node, ...props }) => (
                        <ol className="flex list-decimal flex-col gap-1 pl-5" {...props} />
                    ),
                    a: ({ node, ...props }) => (
                        <a className="font-medium text-foreground underline underline-offset-2" {...props} />
                    ),
                    strong: ({ node, ...props }) => (
                        <strong className="font-semibold" {...props} />
                    ),
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
