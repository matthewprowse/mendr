/**
 * Verifies the production-hardening migration's testable behaviours against real
 * Postgres (PGlite): the new providers.claimed_by_user_id FK (#4) and the
 * issued-invoice immutability trigger (#5). The function REVOKEs (#1) and the
 * audit_logs policy drop (#6) reference live objects not in this harness and are
 * verified against prod via the Supabase advisors instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from '@/__tests__/helpers/pglite-db';

const USER = '11111111-1111-4111-8111-111111111111';
const PROV = 'aaaaaaaa-1111-4111-8111-111111111111';
const INV = 'eeeeeeee-1111-4111-8111-111111111111';

const FK_SQL = `ALTER TABLE public.providers
  ADD CONSTRAINT providers_claimed_by_user_id_fkey
  FOREIGN KEY (claimed_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL`;

const TRIGGER_SQL = `
CREATE OR REPLACE FUNCTION public.invoices_block_issued_edits()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.issued_at IS NOT NULL THEN
    IF NEW.number IS DISTINCT FROM OLD.number
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
      RAISE EXCEPTION 'Issued invoice % is immutable', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS invoices_block_issued_edits ON public.invoices;
CREATE TRIGGER invoices_block_issued_edits BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_block_issued_edits();
`;

let t: TestDb;
beforeAll(async () => {
    t = await createTestDb();
    await t.db.exec(FK_SQL);
    await t.db.exec(TRIGGER_SQL);
});
afterAll(async () => {
    await t.close();
});
beforeEach(async () => {
    await t.truncateAll();
    await t.raw(`INSERT INTO auth.users (id, email) VALUES ('${USER}','a@x.co')`);
    await t.raw(`INSERT INTO public.providers (id, claimed_by_user_id) VALUES ('${PROV}','${USER}')`);
});

describe('#4 providers.claimed_by_user_id FK', () => {
    it('rejects a provider claimed by a non-existent user', async () => {
        await expect(
            t.raw(`INSERT INTO public.providers (id, claimed_by_user_id) VALUES (gen_random_uuid(), '22222222-2222-4222-8222-222222222222')`),
        ).rejects.toThrow();
    });

    it('nulls claimed_by_user_id when the owning user is deleted (no more orphans)', async () => {
        await t.raw(`DELETE FROM auth.users WHERE id = '${USER}'`);
        const rows = await t.raw<{ claimed_by_user_id: string | null }>(
            `SELECT claimed_by_user_id FROM public.providers WHERE id = '${PROV}'`,
        );
        expect(rows[0].claimed_by_user_id).toBeNull();
    });
});

describe('#5 issued-invoice immutability', () => {
    async function issued() {
        await t.raw(`INSERT INTO public.invoices (id, provider_id, subtotal, total) VALUES ('${INV}','${PROV}', 100, 115)`);
        await t.raw(`UPDATE public.invoices SET issued_at = now(), number = 'INV-0001', status = 'sent' WHERE id = '${INV}'`);
    }

    it('allows recording a payment on an issued invoice', async () => {
        await issued();
        await t.raw(`UPDATE public.invoices SET amount_paid = 50, status = 'partial' WHERE id = '${INV}'`);
        const rows = await t.raw<{ amount_paid: number }>(`SELECT amount_paid FROM public.invoices WHERE id = '${INV}'`);
        expect(Number(rows[0].amount_paid)).toBe(50);
    });

    it('blocks changing the number of an issued invoice', async () => {
        await issued();
        await expect(
            t.raw(`UPDATE public.invoices SET number = 'INV-9999' WHERE id = '${INV}'`),
        ).rejects.toThrow(/immutable/);
    });

    it('blocks changing the total of an issued invoice', async () => {
        await issued();
        await expect(
            t.raw(`UPDATE public.invoices SET total = 999 WHERE id = '${INV}'`),
        ).rejects.toThrow(/immutable/);
    });

    it('still allows full edits while the invoice is a draft', async () => {
        await t.raw(`INSERT INTO public.invoices (id, provider_id) VALUES ('${INV}','${PROV}')`);
        await t.raw(`UPDATE public.invoices SET total = 500, number = 'DRAFT-X' WHERE id = '${INV}'`);
        const rows = await t.raw<{ total: number }>(`SELECT total FROM public.invoices WHERE id = '${INV}'`);
        expect(Number(rows[0].total)).toBe(500);
    });
});
