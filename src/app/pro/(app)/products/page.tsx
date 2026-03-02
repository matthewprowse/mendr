import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { ProductsClient } from './_components/products-client';

export const metadata: Metadata = {
    title: 'Products',
    description: 'Your product catalog.',
};

export default async function ProProductsPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        redirect('/auth/login?next=/pro/products');
    }

    const { data: providerProfile } = await supabase
        .from('provider_profiles')
        .select('id, plan_tier')
        .eq('id', user.id)
        .single();
    if (!providerProfile) {
        redirect('/pro/claim');
    }

    const { data: products } = await supabase
        .from('provider_products')
        .select('id, name, description, price, unit, sort_order, active')
        .eq('provider_id', user.id)
        .order('sort_order');

    const planLimits: Record<string, number> = {
        solo_starter: 10,
        team_lite: 25,
        pro_team: 50,
        enterprise: 999,
    };
    const maxProducts = planLimits[providerProfile.plan_tier ?? 'solo_starter'] ?? 10;

    return (
        <ProductsClient
            products={products ?? []}
            maxProducts={maxProducts}
        />
    );
}
