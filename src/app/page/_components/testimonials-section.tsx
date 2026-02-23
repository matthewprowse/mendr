const REVIEW_TEXT =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

const TESTIMONIALS = [
  { name: "Customer Name", date: "23 Feb 2026", review: REVIEW_TEXT },
  { name: "Customer Name", date: "23 Feb 2026", review: REVIEW_TEXT },
  { name: "Customer Name", date: "23 Feb 2026", review: REVIEW_TEXT },
  { name: "Customer Name", date: "23 Feb 2026", review: REVIEW_TEXT },
  { name: "Customer Name", date: "23 Feb 2026", review: REVIEW_TEXT },
  { name: "Customer Name", date: "23 Feb 2026", review: REVIEW_TEXT },
];

export function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      className="bg-secondary/50 py-16 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center align-center justify-center">
          <div className="h-9 bg-muted-foreground/5 rounded-md w-96 mx-auto" />
          <p className="mx-auto mt-4 max-w-3xl text-muted-foreground">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
    <div className="flex flex-col gap-4 rounded-md border border-border/50 bg-card hover:border-border/75 transition-all duration-250 p-4 shadow-none">
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
