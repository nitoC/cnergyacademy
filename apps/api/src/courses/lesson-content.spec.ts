import { estimateReadingMinutes, LessonContentError, normaliseLessonContent } from './lesson-content';

describe('lesson content', () => {
  it('normalises valid blocks and strips unknown properties', () => {
    const out = normaliseLessonContent([{ type: 'paragraph', text: 'Hi', onclick: 'alert(1)', html: '<b>x</b>' }]);
    expect(out).toEqual([{ type: 'paragraph', text: 'Hi' }]);
  });

  it('rejects unknown block types such as raw HTML', () => {
    expect(() => normaliseLessonContent([{ type: 'html', html: '<script>alert(1)</script>' }])).toThrow(LessonContentError);
  });

  it('rejects javascript: and data: URLs', () => {
    expect(() => normaliseLessonContent([{ type: 'image', url: 'javascript:alert(1)', alt: 'x' }])).toThrow(/http/);
    expect(() => normaliseLessonContent([{ type: 'resource', title: 'x', url: 'data:text/html,hi' }])).toThrow(/http/);
    expect(normaliseLessonContent([{ type: 'image', url: '/api/v1/media/public/abc', alt: 'diagram' }])[0]).toMatchObject({ url: '/api/v1/media/public/abc' });
  });

  it('requires alt text and non-empty lists', () => {
    expect(() => normaliseLessonContent([{ type: 'image', url: 'https://x.test/a.png' }])).toThrow(/alt/);
    expect(() => normaliseLessonContent([{ type: 'list', items: [] }])).toThrow(/at least one/);
  });

  it('estimates reading time', () => {
    const words = Array.from({ length: 400 }, () => 'word').join(' ');
    expect(estimateReadingMinutes([{ type: 'paragraph', text: words }])).toBe(2);
  });
});
