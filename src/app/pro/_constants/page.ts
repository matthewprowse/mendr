export const SCANDIO_CATEGORY_ROWS = [
    { key: 'punctuality' as const, label: 'Punctuality' },
    { key: 'cleanliness' as const, label: 'Cleanliness' },
    { key: 'work_quality' as const, label: 'Work Quality' },
    { key: 'quote_accuracy' as const, label: 'Quote Accuracy' },
];

/** Initial batch and each "View more" adds this many reviews per section. */
export const REVIEWS_PAGE_SIZE = 5;
