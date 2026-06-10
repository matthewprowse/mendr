import { TESTIMONIALS } from '@/app/page/components/content';

/**
 * Homeowner testimonials band. Server-rendered.
 *
 * TODO(testimonials): TESTIMONIALS in content.ts is PLACEHOLDER copy. Replace
 * with real, attributable reviews (ideally Supabase-backed) before launch.
 */
export function TestimonialsSection() {
    return (
        <section id="testimonials" className="scroll-mt-16 bg-muted/30 py-16 sm:py-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-12">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">What Homeowners Say</h2>
                    <p className="mt-3 text-base text-muted-foreground">
                        Experiences from homeowners who diagnosed before they called.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {TESTIMONIALS.map((t, idx) => (
                        <figure
                            key={idx}
                            className="flex flex-col rounded-xl border border-border/50 bg-background p-5"
                        >
                            <blockquote className="flex-1 text-sm leading-relaxed text-foreground">
                                &ldquo;{t.quote}&rdquo;
                            </blockquote>
                            <figcaption className="mt-4 border-t border-border/50 pt-4">
                                <span className="block text-sm font-semibold text-foreground">{t.name}</span>
                                <span className="block text-xs text-muted-foreground">{t.context}</span>
                            </figcaption>
                        </figure>
                    ))}
                </div>
            </div>
        </section>
    );
}
