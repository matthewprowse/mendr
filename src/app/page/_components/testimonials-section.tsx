const TESTIMONIALS = [
  {
    name: "Sarah Mitchell",
    date: "Jan 15, 2025",
    review:
      "Had a burst pipe and no idea who to call. Scandio told me exactly what was wrong, estimated the cost, and found three plumbers nearby. Saved me from a costly emergency call-out.",
  },
  {
    name: "James Kelly",
    date: "Feb 3, 2025",
    review:
      "The AI diagnosis was spot on—same issue the electrician confirmed when he arrived. Knowing what to expect and having the report ready made the whole process so much smoother.",
  },
  {
    name: "Lisa Thompson",
    date: "Feb 18, 2025",
    review:
      "Finally, something that actually helps. No more googling vague symptoms or getting different opinions. One photo and I had a clear diagnosis and a shortlist of trusted local pros.",
  },
  {
    name: "David Peters",
    date: "Mar 2, 2025",
    review:
      "My gate motor was acting up and I had no clue. Scandio identified it, gave me a cost estimate, and connected me with a specialist. The whole thing took minutes. Absolutely brilliant.",
  },
  {
    name: "Emma Robinson",
    date: "Mar 14, 2025",
    review:
      "Used it for a leaking geyser. The diagnosis was detailed and the contractor arrived knowing what to expect. No more explaining the problem five times. Will use again.",
  },
  {
    name: "Michael Bennett",
    date: "Mar 21, 2025",
    review:
      "Roof was dripping after a storm. Scandio explained what was likely wrong, the rough cost, and put me in touch with reputable roofers. Sorted within a week. Highly recommend.",
  },
];

export function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      className="border-t border-b border-border bg-muted/20 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            What Homeowners Say
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Real feedback from people who used Scandio to diagnose and fix their
            home maintenance issues.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map(({ name, date, review }, i) => (
            <TestimonialCard key={i} name={name} date={date} review={review} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialCard({
  name,
  date,
  review,
}: {
  name: string;
  date: string;
  review: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-input bg-card p-4 shadow-none">
      <blockquote className="border-l-2 border-input pl-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {review}
        </p>
      </blockquote>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">{date}</span>
      </div>
    </div>
  );
}
