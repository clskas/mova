import { sanitizeLegalHtml } from './legal-html';

describe('sanitizeLegalHtml', () => {
  it('keeps formatting and links', () => {
    const out = sanitizeLegalHtml('<h2>Article 1</h2><p>Voir <a href="https://senga.afri-soft.com/support">le support</a>.</p><ul><li>un</li></ul>');
    expect(out).toContain('<h2>Article 1</h2>');
    expect(out).toContain('href="https://senga.afri-soft.com/support"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('<li>un</li>');
  });

  it('removes scripts, event handlers, frames, forms and javascript: links', () => {
    const out = sanitizeLegalHtml(
      '<script>alert(1)</script><img src=x onerror="alert(2)"><iframe src="https://evil.example"></iframe>' +
        '<form action="https://evil.example"><input name="pin"></form><a href="javascript:alert(3)">x</a>' +
        '<p onclick="alert(4)" style="position:fixed">ok</p>',
    );
    expect(out).not.toMatch(/script|onerror|onclick|iframe|<form|<input|javascript:|style=|<img/i);
    expect(out).toContain('<p>ok</p>');
  });
});
