type PreviewRequest = {
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

type PreviewResponse = {
  status: (code: number) => PreviewResponse;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
};

function replaceOrInsertMeta(html: string, property: string, tag: string): string {
  const pattern = new RegExp(`<meta\\s+property=["']${property.replace(':', '\\:')}["'][^>]*>`, 'i');
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function removeMeta(html: string, attribute: 'name' | 'property', value: string): string {
  const pattern = new RegExp(`<meta\\s+[^>]*${attribute}=["']${value.replace(':', '\\:')}["'][^>]*>\\s*`, 'gi');
  return html.replace(pattern, '');
}

const trackingImageVersion = '2';

export default async function handler(req: PreviewRequest, res: PreviewResponse) {
  const requestHost = req.headers?.['x-forwarded-host'] || req.headers?.host || 'admin.trustyyellowcabs.in';
  const host = Array.isArray(requestHost) ? requestHost[0] : requestHost;
  const origin = `https://${host}`;
  const trackQuery = req.query?.track;
  const trackToken = Array.isArray(trackQuery) ? trackQuery[0] : trackQuery;
  const publicUrl = new URL('/', origin);
  publicUrl.searchParams.set('track', trackToken || '');
  const imageUrl = `${origin}/tracking-share.jpg?v=${trackingImageVersion}`;

  try {
    // Reuse the production app shell so the browser still receives the normal
    // React tracking page while crawlers receive metadata in the first HTML.
    const shellResponse = await fetch(new URL('/index.html', origin));
    if (!shellResponse.ok) throw new Error(`App shell request failed: ${shellResponse.status}`);

    let html = await shellResponse.text();
    html = html.replace(/<title>[^<]*<\/title>/i, '');
    html = removeMeta(html, 'name', 'description');
    html = removeMeta(html, 'property', 'og:title');
    html = removeMeta(html, 'property', 'og:description');
    html = removeMeta(html, 'name', 'twitter:title');
    html = removeMeta(html, 'name', 'twitter:description');
    html = removeMeta(html, 'name', 'twitter:card');
    html = removeMeta(html, 'name', 'twitter:image');
    html = replaceOrInsertMeta(html, 'og:image', `<meta property="og:image" content="${imageUrl}" />`);
    html = replaceOrInsertMeta(html, 'og:image:secure_url', `<meta property="og:image:secure_url" content="${imageUrl}" />`);
    html = replaceOrInsertMeta(html, 'og:image:type', '<meta property="og:image:type" content="image/jpeg" />');
    html = replaceOrInsertMeta(html, 'og:type', '<meta property="og:type" content="website" />');
    html = replaceOrInsertMeta(html, 'og:url', `<meta property="og:url" content="${publicUrl}" />`);

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (error) {
    console.error('Tracking preview shell generation failed:', error);
    res.status(503).send('Tracking preview unavailable');
  }
}
