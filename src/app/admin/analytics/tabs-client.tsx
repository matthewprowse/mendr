'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AdminFunnelClient from '../funnel/client';
import AiCostsClient from '../ai-costs/client';
import AdminQualityClient from '../quality/client';
import AdminAnalyticsEvents from './client';

/**
 * Analytics hub. The durable funnel (Phase 4), AI cost (Phase 5) and diagnosis
 * quality (Phase 6) each live in a tab. The old session-based `diagnosis_events`
 * view is kept as a de-emphasised "Events" tab (raw/legacy; the stream stopped
 * producing data on 2026-04-26).
 */
export default function AnalyticsTabsClient() {
    return (
        <Tabs defaultValue="funnel" className="w-full">
            <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 lg:px-8">
                <TabsList>
                    <TabsTrigger value="funnel">Funnel</TabsTrigger>
                    <TabsTrigger value="cost">AI Cost</TabsTrigger>
                    <TabsTrigger value="quality">Quality</TabsTrigger>
                    <TabsTrigger value="events">Events</TabsTrigger>
                </TabsList>
            </div>
            <TabsContent value="funnel">
                <AdminFunnelClient />
            </TabsContent>
            <TabsContent value="cost">
                <AiCostsClient />
            </TabsContent>
            <TabsContent value="quality">
                <AdminQualityClient />
            </TabsContent>
            <TabsContent value="events">
                <AdminAnalyticsEvents />
            </TabsContent>
        </Tabs>
    );
}
