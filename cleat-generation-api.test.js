const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPrompt, decodeImageDataUrl, requestInsideArtwork } = require('./cleat-generation-api');

const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8z8AARMAgYKSAAAMAAgAB9HFkzgAAAABJRU5ErkJggg==';

test('buildPrompt carries teacher context and protects student intent', () => {
  const prompt = buildPrompt({
    cause: 'Autism awareness',
    primaryColor: 'Royal blue',
    secondaryColor: 'White',
    notes: 'Gold laces'
  });
  assert.match(prompt, /Autism awareness/);
  assert.match(prompt, /Royal blue/);
  assert.match(prompt, /Gold laces/);
  assert.match(prompt, /not a simple horizontal mirror/);
  assert.match(prompt, /toe pointing left and heel on the right/);
  assert.match(prompt, /Do not invent brand logos/);
});

test('decodeImageDataUrl accepts supported images and rejects other input', () => {
  const decoded = decodeImageDataUrl(onePixelPng);
  assert.equal(decoded.mimeType, 'image/png');
  assert.ok(decoded.buffer.length > 0);
  assert.throws(() => decodeImageDataUrl('data:image/svg+xml;base64,PHN2Zz4='), /PNG or JPG/);
});

test('requestInsideArtwork sends a private image edit and returns a data URL', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      headers: { get: () => 'request-test' },
      json: async () => ({ data: [{ b64_json: 'aW5zaWRl' }] })
    };
  };

  const result = await requestInsideArtwork({ imageDataUrl: onePixelPng, cause: 'Kindness' }, fetchImpl, 'test-key');
  assert.equal(result, 'data:image/png;base64,aW5zaWRl');
  assert.equal(request.url, 'https://api.openai.com/v1/images/edits');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(request.options.body.get('model'), 'gpt-image-2');
  assert.equal(request.options.body.get('size'), '1536x1024');
  assert.equal(request.options.body.get('quality'), 'medium');
});
