import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchDataForSEOReviews } from '../dataforseo-client';

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.DATAFORSEO_LOGIN = 'login@example.com';
    process.env.DATAFORSEO_PASSWORD = 'secret';
});

afterEach(() => {
    vi.useRealTimers();
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
});

describe('fetchDataForSEOReviews', () => {
    it('returns null when credentials are missing', async () => {
        delete process.env.DATAFORSEO_LOGIN;
        delete process.env.DATAFORSEO_PASSWORD;
        const fetchSpy = vi.spyOn(global, 'fetch');
        expect(await fetchDataForSEOReviews('ChIJ123')).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns null when the place id is empty after stripping', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch');
        expect(await fetchDataForSEOReviews('places/')).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('sends a Basic auth header and the place id in the task_post body', async () => {
        const fetchSpy = vi
            .spyOn(global, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ tasks: [{ id: 'task-1' }] }));
        vi.useFakeTimers();

        const promise = fetchDataForSEOReviews('places/ChIJ123');
        // Allow the task_post fetch to resolve before the poll delay.
        await vi.advanceTimersByTimeAsync(0);

        // The post call should already have happened.
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toContain('/business_data/google/reviews/task_post');
        const headers = (init as RequestInit).headers as Record<string, string>;
        expect(headers.Authorization).toMatch(/^Basic /);
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body[0].place_id).toBe('ChIJ123');

        // Provide the task_get response and drive timers forward.
        fetchSpy.mockResolvedValueOnce(
            jsonResponse({
                tasks: [
                    {
                        status_code: 20000,
                        result: [
                            {
                                title: 'Acme Plumbing',
                                rating: { votes_count: 42 },
                                items: [
                                    {
                                        review_text: 'Excellent service',
                                        rating: 5,
                                        review_url: 'https://g.co/r/1',
                                        profile_name: 'Jane',
                                        timestamp: '2026-01-01',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            })
        );
        await vi.advanceTimersByTimeAsync(15_000);
        const result = await promise;

        expect(result).toEqual({
            title: 'Acme Plumbing',
            rating_count: 42,
            reviews: [
                {
                    review_url: 'https://g.co/r/1',
                    rating: 5,
                    review_text: 'Excellent service',
                    reviewer_name: 'Jane',
                    timestamp: '2026-01-01',
                },
            ],
        });
    });

    it('returns null on a non-200 task_post response', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('bad', { status: 500 }));
        expect(await fetchDataForSEOReviews('ChIJ123')).toBeNull();
    });

    it('returns null when no task id is returned', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({ tasks: [{}] }));
        expect(await fetchDataForSEOReviews('ChIJ123')).toBeNull();
    });

    it('returns null when the task_post fetch throws', async () => {
        vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network'));
        expect(await fetchDataForSEOReviews('ChIJ123')).toBeNull();
    });

    it('returns an empty-result object when the task completes with no results', async () => {
        const fetchSpy = vi
            .spyOn(global, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ tasks: [{ id: 'task-1' }] }));
        vi.useFakeTimers();
        const promise = fetchDataForSEOReviews('ChIJ123');
        await vi.advanceTimersByTimeAsync(0);
        fetchSpy.mockResolvedValueOnce(jsonResponse({ tasks: [{ status_code: 20000, result: [] }] }));
        await vi.advanceTimersByTimeAsync(15_000);
        expect(await promise).toEqual({ title: null, rating_count: null, reviews: [] });
    });

    it('discards rating-only reviews with no text', async () => {
        const fetchSpy = vi
            .spyOn(global, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ tasks: [{ id: 'task-1' }] }));
        vi.useFakeTimers();
        const promise = fetchDataForSEOReviews('ChIJ123');
        await vi.advanceTimersByTimeAsync(0);
        fetchSpy.mockResolvedValueOnce(
            jsonResponse({
                tasks: [
                    {
                        status_code: 20000,
                        result: [{ title: 'X', items: [{ rating: 5, review_text: '   ' }] }],
                    },
                ],
            })
        );
        await vi.advanceTimersByTimeAsync(15_000);
        const result = await promise;
        expect(result!.reviews).toEqual([]);
    });

    it('returns null on a non-200 task_get response', async () => {
        const fetchSpy = vi
            .spyOn(global, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ tasks: [{ id: 'task-1' }] }));
        vi.useFakeTimers();
        const promise = fetchDataForSEOReviews('ChIJ123');
        await vi.advanceTimersByTimeAsync(0);
        fetchSpy.mockResolvedValueOnce(new Response('err', { status: 500 }));
        await vi.advanceTimersByTimeAsync(15_000);
        expect(await promise).toBeNull();
    });
});
