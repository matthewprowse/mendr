/**
 * Behaviour tests for the durable provider-view client helper.
 * Runs under jsdom (filename ends in `.dom.test.tsx`) so `window`,
 * `sessionStorage`, and a stubbable `fetch` are available.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackProviderView } from '../provider-view';

const PROVIDER_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const PROVIDER_B = 'bbbbbbbb-1111-2222-3333-444444444444';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('trackProviderView', () => {
    it('POSTs to the provider view endpoint with the provider id in the path', () => {
        trackProviderView(PROVIDER_A, { source: 'match', diagnosisId: 'diag-1' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe(`/api/providers/${PROVIDER_A}/view`);
        expect(init).toMatchObject({ method: 'POST' });
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body).toMatchObject({ source: 'match', diagnosisId: 'diag-1' });
        expect(typeof body.sessionId).toBe('string');
    });

    it('fires at most once per provider per session', () => {
        trackProviderView(PROVIDER_B, { source: 'contractor_page' });
        trackProviderView(PROVIDER_B, { source: 'contractor_page' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing when providerId is empty', () => {
        trackProviderView('', { source: 'match' });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
