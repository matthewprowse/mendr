/**
 * Tests for `AddressAutocomplete`. It debounces input (300ms), queries Google
 * Places (SA-only), renders up to 3 suggestions, and resolves the picked place
 * to {address, lat, lng} via getDetails. The Maps SDK is mocked; we drive the
 * debounce with real timers under waitFor.
 *
 * Pinned: no query under 3 chars, suggestions render after debounce, selecting
 * a row fires onChange + onSelect with resolved coordinates.
 */
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const maps = vi.hoisted(() => ({
    getPlacePredictions: vi.fn(),
    getDetails: vi.fn(),
    AutocompleteService: vi.fn(),
    PlacesService: vi.fn(),
    importLibrary: vi.fn(async () => ({})),
    ensureGoogleMapsLoaderOptions: vi.fn(),
}));

vi.mock('@googlemaps/js-api-loader', () => ({ importLibrary: maps.importLibrary }));
vi.mock('@/lib/google-maps-js-loader', () => ({
    ensureGoogleMapsLoaderOptions: maps.ensureGoogleMapsLoaderOptions,
}));

import { AddressAutocomplete, type SelectedPlace } from '@/components/address-autocomplete';

function Harness({ onSelect }: { onSelect: (p: SelectedPlace) => void }) {
    const [v, setV] = useState('');
    return <AddressAutocomplete value={v} onChange={setV} onSelect={onSelect} />;
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';

    // Regular functions (not arrows) so `new ...()` returns the object — Maps
    // SDK classes are invoked with `new`.
    maps.AutocompleteService.mockImplementation(function () {
        return { getPlacePredictions: maps.getPlacePredictions };
    });
    maps.PlacesService.mockImplementation(function () {
        return { getDetails: maps.getDetails };
    });

    (window as unknown as { google: unknown }).google = {
        maps: {
            places: {
                AutocompleteService: maps.AutocompleteService,
                PlacesService: maps.PlacesService,
            },
        },
    };
});

afterEach(() => {
    delete (window as unknown as { google?: unknown }).google;
});

describe('AddressAutocomplete', () => {
    it('does not query Places for input shorter than 3 characters', async () => {
        const user = userEvent.setup();
        render(<Harness onSelect={vi.fn()} />);
        await waitFor(() => expect(maps.AutocompleteService).toHaveBeenCalled());

        await user.type(screen.getByRole('textbox'), '12');
        // Give the debounce window time to (not) fire.
        await new Promise((r) => setTimeout(r, 350));
        expect(maps.getPlacePredictions).not.toHaveBeenCalled();
    });

    it('renders up to 3 SA-restricted suggestions after the debounce', async () => {
        const user = userEvent.setup();
        maps.getPlacePredictions.mockImplementation((_req, cb) =>
            cb(
                [
                    {
                        place_id: 'p1',
                        description: '12 Main Rd, Sea Point',
                        structured_formatting: { main_text: '12 Main Rd', secondary_text: 'Sea Point' },
                    },
                    {
                        place_id: 'p2',
                        description: '12 Main Ave, Claremont',
                        structured_formatting: { main_text: '12 Main Ave', secondary_text: 'Claremont' },
                    },
                    { place_id: 'p3', description: 'Third', structured_formatting: { main_text: 'Third' } },
                    { place_id: 'p4', description: 'Fourth', structured_formatting: { main_text: 'Fourth' } },
                ],
                'OK',
            ),
        );

        render(<Harness onSelect={vi.fn()} />);
        await waitFor(() => expect(maps.AutocompleteService).toHaveBeenCalled());
        await user.type(screen.getByRole('textbox'), '12 Main');

        await waitFor(() => expect(screen.getByText('12 Main Rd')).toBeInTheDocument());
        expect(screen.getByText('12 Main Ave')).toBeInTheDocument();
        expect(screen.getByText('Third')).toBeInTheDocument();
        // Capped at MAX_SUGGESTIONS = 3.
        expect(screen.queryByText('Fourth')).not.toBeInTheDocument();

        // SA-only restriction is passed to the Places query.
        expect(maps.getPlacePredictions).toHaveBeenCalledWith(
            expect.objectContaining({ componentRestrictions: { country: 'za' } }),
            expect.any(Function),
        );
    });

    it('resolves the picked place and fires onChange + onSelect with coordinates', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        maps.getPlacePredictions.mockImplementation((_req, cb) =>
            cb(
                [
                    {
                        place_id: 'p1',
                        description: '12 Main Rd, Sea Point',
                        structured_formatting: { main_text: '12 Main Rd', secondary_text: 'Sea Point' },
                    },
                ],
                'OK',
            ),
        );
        maps.getDetails.mockImplementation((_req, cb) =>
            cb(
                {
                    formatted_address: '12 Main Rd, Sea Point, Cape Town',
                    geometry: { location: { lat: () => -33.91, lng: () => 18.38 } },
                },
                'OK',
            ),
        );

        render(<Harness onSelect={onSelect} />);
        await waitFor(() => expect(maps.AutocompleteService).toHaveBeenCalled());
        await user.type(screen.getByRole('textbox'), '12 Main');
        await waitFor(() => expect(screen.getByText('12 Main Rd')).toBeInTheDocument());

        await user.click(screen.getByText('12 Main Rd'));

        await waitFor(() =>
            expect(onSelect).toHaveBeenCalledWith({
                address: '12 Main Rd, Sea Point, Cape Town',
                lat: -33.91,
                lng: 18.38,
            }),
        );
        // The resolved address is written back into the input.
        expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(
            '12 Main Rd, Sea Point, Cape Town',
        );
    });

    it('clears suggestions when Places returns a non-OK status', async () => {
        const user = userEvent.setup();
        maps.getPlacePredictions.mockImplementation((_req, cb) => cb(null, 'ZERO_RESULTS'));
        render(<Harness onSelect={vi.fn()} />);
        await waitFor(() => expect(maps.AutocompleteService).toHaveBeenCalled());
        await user.type(screen.getByRole('textbox'), 'zzzqqq');
        await new Promise((r) => setTimeout(r, 350));
        expect(maps.getPlacePredictions).toHaveBeenCalled();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
