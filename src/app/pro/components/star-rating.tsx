import { Star, StarHalf } from 'lucide-react';

const starIconClass = (size: 'sm' | 'md') => (size === 'sm' ? 'h-4 w-4' : 'h-5 w-5');

/** Read-only: supports half stars (e.g. 4.5 → four full + one half). */
export function StarRatingDisplay({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
    const cls = starIconClass(size);
    return (
        <div className="flex flex-row items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((i) => {
                if (rating >= i) {
                    return (
                        <Star
                            key={`star-${i}`}
                            className={`${cls} text-yellow-500`}
                            fill="currentColor"
                            strokeWidth={2}
                        />
                    );
                }
                if (rating >= i - 0.5) {
                    return (
                        <StarHalf
                            key={`star-${i}`}
                            className={`${cls} text-yellow-500`}
                            fill="currentColor"
                            strokeWidth={2}
                        />
                    );
                }
                return (
                    <Star
                        key={`star-${i}`}
                        className={`${cls} text-muted-foreground`}
                        fill="none"
                        strokeWidth={1.5}
                    />
                );
            })}
        </div>
    );
}
