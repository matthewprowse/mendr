'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AdminPageHeader } from '../components/page-header';
import AdminProvidersClient from './client';
import AdminReviewsClient from '../reviews/client';
import AdminGalleryClient from '../gallery/client';

/**
 * Providers hub. Reviews and gallery are provider data, not standalone sections,
 * so they live here as tabs alongside the provider directory. (Provider
 * applications will move to the Inbox hub in a later step.)
 */
export default function ProvidersHubClient() {
    return (
        <Tabs defaultValue="directory" className="w-full">
            <div className="mx-auto w-full max-w-xl px-4 pt-4 sm:px-6 lg:px-8">
                <div className="mb-4">
                    <AdminPageHeader title="Providers" description="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt." />
                </div>
                <TabsList>
                    <TabsTrigger value="directory">Directory</TabsTrigger>
                    <TabsTrigger value="reviews">Reviews</TabsTrigger>
                    <TabsTrigger value="gallery">Gallery</TabsTrigger>
                </TabsList>
            </div>
            <TabsContent value="directory">
                <AdminProvidersClient />
            </TabsContent>
            <TabsContent value="reviews">
                <AdminReviewsClient />
            </TabsContent>
            <TabsContent value="gallery">
                <AdminGalleryClient />
            </TabsContent>
        </Tabs>
    );
}
