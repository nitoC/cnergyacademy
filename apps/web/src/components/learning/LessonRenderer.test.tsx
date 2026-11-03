import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LessonRenderer } from './LessonRenderer';
import { renderInline } from './inline';

describe('LessonRenderer', () => {
  it('renders structured blocks as semantic elements', () => {
    render(
      <LessonRenderer
        blocks={[
          { type: 'heading', level: 2, text: 'Thin slices' },
          { type: 'list', style: 'number', items: ['One', 'Two'] },
          { type: 'code', language: 'ts', code: 'const x = 1;' },
          { type: 'callout', tone: 'tip', title: 'Rule', text: 'Ship small' },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Thin slices' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('const x = 1;').tagName).toBe('CODE');
    expect(screen.getByText('Rule')).toBeInTheDocument();
  });

  it('never injects HTML from lesson text', () => {
    const { container } = render(<LessonRenderer blocks={[{ type: 'paragraph', text: '<img src=x onerror=alert(1)><script>alert(1)</script>' }]} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>');
  });

  it('drops images and resources with unsafe URLs', () => {
    const { container } = render(
      <LessonRenderer blocks={[{ type: 'image', url: 'javascript:alert(1)', alt: 'x' }, { type: 'resource', title: 'Bad', url: 'data:text/html,hi' }]} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });
});

describe('renderInline', () => {
  it('formats bold, italic, code and http links', () => {
    render(<p>{renderInline('A **bold** and *soft* `code` [docs](https://example.com)')}</p>);
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('soft').tagName).toBe('EM');
    expect(screen.getByText('code').tagName).toBe('CODE');
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('renders non-http links as plain text', () => {
    render(<p>{renderInline('[click](javascript:void0)')}</p>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('click')).toBeInTheDocument();
  });
});
