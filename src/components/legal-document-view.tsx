import ReactMarkdown from 'react-markdown';

type LegalDocumentViewProps = {
    content: string;
};

export function LegalDocumentView({ content }: LegalDocumentViewProps) {
    return (
        <article className="max-w-none">
            <ReactMarkdown
                components={{
                    h1: ({ children }) => (
                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl mb-6">
                            {children}
                        </h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className="text-xl font-semibold mt-8 mb-4">
                            {children}
                        </h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className="text-lg font-medium mt-6 mb-3">
                            {children}
                        </h3>
                    ),
                    p: ({ children }) => (
                        <p className="text-base text-muted-foreground leading-relaxed mb-4">
                            {children}
                        </p>
                    ),
                    ul: ({ children }) => (
                        <ul className="list-disc pl-6 mb-4 space-y-1 text-base text-muted-foreground">
                            {children}
                        </ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="list-decimal pl-6 mb-4 space-y-1 text-base text-muted-foreground">
                            {children}
                        </ol>
                    ),
                    li: ({ children }) => (
                        <li className="leading-relaxed">{children}</li>
                    ),
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            className="text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors"
                            target={href?.startsWith('http') ? '_blank' : undefined}
                            rel={
                                href?.startsWith('http')
                                    ? 'noopener noreferrer'
                                    : undefined
                            }
                        >
                            {children}
                        </a>
                    ),
                    strong: ({ children }) => (
                        <strong className="font-semibold text-foreground">
                            {children}
                        </strong>
                    ),
                    hr: () => <hr className="my-8 border-border" />,
                }}
            >
                {content}
            </ReactMarkdown>
        </article>
    );
}
