# Cloudflare cache rules

Use Cloudflare in front of the production domain and keep Firebase/Netlify as the origin. These rules are intended to reduce repeated origin reads for static assets and Firebase Storage media.

## 1. Frontend static assets

Create a Cache Rule:

- Name: `Cache immutable frontend assets`
- If: `URI Path starts with /assets/`
- Then:
  - Cache eligibility: `Eligible for cache`
  - Edge TTL: `1 year`
  - Browser TTL: `1 year`
  - Respect strong ETags: enabled, if available

The repo also ships `public/_headers`, so the origin sends `Cache-Control: public, max-age=31536000, immutable` for Vite hashed assets.

## 2. HTML and API routes

Create bypass rules before any broad cache-everything rule:

- If: `URI Path equals /` or `URI Path ends with .html`
  - Cache eligibility: `Bypass cache` or keep origin `Cache-Control: public, max-age=0, must-revalidate`
- If: `URI Path starts with /api/`
  - Cache eligibility: `Bypass cache`

Do not cache API responses that call Gemini or any route that returns user-specific data.

## 3. Firebase Storage media

If Firebase Storage files are exposed through the production domain or a Cloudflare proxied subdomain, add:

- Name: `Cache Firebase Storage media`
- If one of:
  - Hostname equals the proxied storage/media hostname
  - URI Path starts with the storage media prefix used by the app
- Then:
  - Cache eligibility: `Eligible for cache`
  - Edge TTL: `1 month` to `1 year`
  - Browser TTL: `1 month` to `1 year`
  - Cache key: ignore query strings only if files are public and token/query parameters are not used for authorization

Important: do not ignore query strings for signed/private Firebase Storage URLs. Firebase download tokens in query strings can be part of access control and cache identity.

## 4. Firestore

Do not put Firestore REST or websocket traffic behind Cache Everything. Classroom room documents are real-time collaborative state and must stay uncached.
