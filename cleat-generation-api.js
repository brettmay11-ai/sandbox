const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const GENERATION_WINDOW_MS = 10 * 60 * 1000;
const GENERATIONS_PER_WINDOW = 6;
const generationHistory = new Map();
const activeGenerations = new Set();

function readJsonLimited(request, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let settled = false;

    request.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settled = true;
        const error = new Error('The uploaded artwork is too large.');
        error.status = 413;
        reject(error);
        request.resume();
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      if (settled) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        const error = new Error('The artwork request was not valid.');
        error.status = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function decodeImageDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) {
    const error = new Error('Upload a PNG or JPG worksheet before generating the inside.');
    error.status = 400;
    throw error;
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    const error = new Error('The uploaded artwork is too large. Try a smaller image.');
    error.status = 413;
    throw error;
  }
  return { buffer, mimeType: match[1], extension: match[1] === 'image/png' ? 'png' : 'jpg' };
}

function generationAllowed(userId) {
  const now = Date.now();
  const recent = (generationHistory.get(userId) || []).filter(time => now - time < GENERATION_WINDOW_MS);
  if (recent.length >= GENERATIONS_PER_WINDOW) return false;
  recent.push(now);
  generationHistory.set(userId, recent);
  return true;
}

function buildPrompt(body) {
  const cause = cleanText(body.cause, 100) || 'the student selected cause';
  const primary = cleanText(body.primaryColor, 30) || 'the dominant color in the reference';
  const secondary = cleanText(body.secondaryColor, 30) || 'the supporting color in the reference';
  const notes = cleanText(body.notes, 120) || 'none provided';

  return `Create matching artwork for the INSIDE side of the same football cleat design shown in the reference image.

This is student-created My Cause My Cleats artwork. Preserve the student's visual language, hand-drawn character, exact color relationships, recognizable symbols, patterns, and any clearly legible words. Extend the idea thoughtfully so the inside feels intentionally related but is not a simple horizontal mirror.

Cause: ${cause}
Primary color: ${primary}
Secondary color: ${secondary}
Lace or sole notes: ${notes}

Output requirements:
- A true inside-side flat artwork asset, heel on the left and toe pointing right, so it projects correctly on the medial side of the 3D cleat.
- Plain white background with generous empty space around the artwork.
- Artwork only: no realistic shoe, no cleats, no sole, no laces, no mockup, no shadows, no scenery, and no labels.
- Keep all important marks safely inside a wide football-cleat side silhouette.
- Do not invent brand logos, team logos, sponsor marks, or new words.
- Preserve exact student wording only when it is clearly readable in the reference.
- Strong, clean shapes that will project well onto a 3D cleat.`;
}

async function requestInsideArtwork(body, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY) {
  if (!apiKey) {
    const error = new Error('Inside artwork generation is not configured yet. Add OPENAI_API_KEY to the web service.');
    error.status = 503;
    throw error;
  }

  const image = decodeImageDataUrl(body.imageDataUrl);
  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('image', new Blob([image.buffer], { type: image.mimeType }), `outside-cleat.${image.extension}`);
  form.append('prompt', buildPrompt(body));
  form.append('size', '1536x1024');
  form.append('quality', 'medium');
  form.append('output_format', 'png');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150000);
  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal
    });
  } catch (error) {
    const wrapped = new Error(error.name === 'AbortError'
      ? 'Inside artwork generation took too long. Please try again.'
      : 'The artwork service could not be reached. Please try again.');
    wrapped.status = 502;
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('OpenAI image edit failed', { status: response.status, requestId: response.headers.get('x-request-id') });
    const error = new Error(response.status === 429
      ? 'Artwork generation is busy right now. Wait a moment and try again.'
      : 'The inside artwork could not be generated. Please try again.');
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  const base64 = result.data?.[0]?.b64_json;
  if (!base64) {
    const error = new Error('The artwork service returned an empty image. Please try again.');
    error.status = 502;
    throw error;
  }
  return `data:image/png;base64,${base64}`;
}

async function handleCleatGeneration({ req, res, path, user, sendJson, fetchImpl }) {
  if (path !== '/api/teacher/cleats/generate-inside') return false;
  if (!user) return sendJson(res, 401, { error: 'Please sign in.' }), true;
  if (user.role !== 'teacher') return sendJson(res, 403, { error: 'Teacher access required.' }), true;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' }), true;
  if (activeGenerations.has(user.id)) return sendJson(res, 409, { error: 'An inside design is already being generated.' }), true;
  if (!generationAllowed(user.id)) return sendJson(res, 429, { error: 'Generation limit reached. Please wait a few minutes.' }), true;

  activeGenerations.add(user.id);
  try {
    const body = await readJsonLimited(req);
    const imageDataUrl = await requestInsideArtwork(body, fetchImpl);
    sendJson(res, 200, { imageDataUrl });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || 'Inside artwork generation failed.' });
  } finally {
    activeGenerations.delete(user.id);
  }
  return true;
}

module.exports = { buildPrompt, decodeImageDataUrl, handleCleatGeneration, requestInsideArtwork };
