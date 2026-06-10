/**
 * Tests for the lightweight `Markdown` renderer. It maps a small set of
 * markdown elements to app-styled tags; these assert the structural mapping
 * (headings, lists, links, emphasis) rather than exact classNames.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Markdown } from '@/components/markdown';

describe('Markdown', () => {
    it('renders a heading as an <h2> with its text', () => {
        render(<Markdown>{'## Cost estimates'}</Markdown>);
        const h2 = screen.getByRole('heading', { level: 2 });
        expect(h2).toHaveTextContent('Cost estimates');
    });

    it('renders bullet lists as <ul><li>', () => {
        render(<Markdown>{'- first\n- second'}</Markdown>);
        const items = screen.getAllByRole('listitem');
        expect(items).toHaveLength(2);
        expect(items[0]).toHaveTextContent('first');
    });

    it('renders links with href and underline styling', () => {
        render(<Markdown>{'See [our guide](https://mendr.test/guide).'}</Markdown>);
        const link = screen.getByRole('link', { name: 'our guide' });
        expect(link).toHaveAttribute('href', 'https://mendr.test/guide');
    });

    it('renders strong emphasis as <strong>', () => {
        render(<Markdown>{'This is **important** text.'}</Markdown>);
        expect(screen.getByText('important').tagName).toBe('STRONG');
    });

    it('passes through plain paragraphs', () => {
        render(<Markdown>{'Just a sentence.'}</Markdown>);
        expect(screen.getByText('Just a sentence.')).toBeInTheDocument();
    });
});
