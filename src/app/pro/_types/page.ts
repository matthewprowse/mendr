import { SCANDIO_CATEGORY_ROWS } from '../_constants/page';

export type CategoryKey = (typeof SCANDIO_CATEGORY_ROWS)[number]['key'];

export type ReviewCard = {
    id: string;
    fullName: string;
    initials: string;
    rating: number | null;
    sentAt: string;
    body: string;
    title?: string;
};

export type GalleryImage = {
    id: string;
    url: string;
    caption: string | null;
    source: string | null;
    path: string | null;
};

export type GalleryDraftItem = {
    id: string;
    file: File;
    caption: string;
    preview: string;
};
