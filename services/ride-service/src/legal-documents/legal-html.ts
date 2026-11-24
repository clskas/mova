import * as sanitizeHtml from 'sanitize-html';

/**
 * CGU / privacy pages written in the admin are shown as HTML on the public site.
 * Security audit 2026-11-24: keep only formatting tags, so a hijacked admin account
 * cannot place a script, form or frame on senga.afri-soft.com.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'blockquote',
    'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sup', 'sub',
    'a', 'span', 'div', 'section', 'article', 'header', 'footer',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'code', 'pre',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['https', 'http', 'mailto', 'tel'],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
  },
};

export function sanitizeLegalHtml(html: string): string {
  return sanitizeHtml(html ?? '', OPTIONS);
}
