/** Review category rows — used for structured per-category ratings on pro profiles. */
export const SCANDIO_CATEGORY_ROWS = [
    { key: 'punctuality' as const, label: 'Punctuality' },
    { key: 'cleanliness' as const, label: 'Cleanliness' },
    { key: 'work_quality' as const, label: 'Work Quality' },
    { key: 'quote_accuracy' as const, label: 'Quote Accuracy' },
];

/** Initial batch size and each "View more" load for Mendr-native reviews. */
export const REVIEWS_PAGE_SIZE = 5;

/** Google reviews shown on the pro profile (Places API only returns a few per sync). */
export const GOOGLE_REVIEWS_MAX_DISPLAY = 5;
