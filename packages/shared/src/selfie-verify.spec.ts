import { verifySelfieBuffer, parseSelfieVisionResponse } from './selfie-verify';

describe('verifySelfieBuffer', () => {
  it('rejects empty buffer', () => {
    const r = verifySelfieBuffer(Buffer.alloc(0));
    expect(r.ok).toBe(false);
  });

  it('rejects tiny payload', () => {
    const r = verifySelfieBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    expect(r.ok).toBe(false);
  });

  it('accepts a textured JPEG-like buffer', () => {
    const buf = Buffer.alloc(20_000);
    buf[0] = 0xff;
    buf[1] = 0xd8;
    for (let i = 2; i < buf.length; i++) buf[i] = (i * 37 + 11) % 256;
    const r = verifySelfieBuffer(buf, { mimeType: 'image/jpeg' });
    expect(r.ok).toBe(true);
    expect(r.score).toBeGreaterThan(0.4);
  });
});

describe('parseSelfieVisionResponse', () => {
  it('parses valid JSON', () => {
    const p = parseSelfieVisionResponse(
      '{"isLiveSelfie":true,"faceVisible":true,"looksLikeDocumentScan":false,"confidence":0.9,"notes":"ok"}',
    );
    expect(p.isLiveSelfie).toBe(true);
    expect(p.faceVisible).toBe(true);
    expect(p.confidence).toBe(0.9);
  });
});
