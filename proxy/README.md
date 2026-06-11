# Mongo Proxy for Lovable

Tiny HTTPS proxy that bridges Cloudflare Workers (which only allow HTTPS) to
MongoDB Atlas (TCP driver).

## Deploy to Render (free tier)

1. Push this `proxy/` folder to its own GitHub repo (or use the same repo and set Render's root directory to `proxy`).
2. On https://render.com → New → Web Service → connect repo.
3. Build command: `npm install`  •  Start command: `npm start`
4. Add Environment Variables:
   - `MONGODB_URI` = `mongodb+srv://bochra:...@cluster0.upfaqeh.mongodb.net/`
   - `MONGODB_DATABASE` = `taskapp`
   - `PROXY_API_KEY` = any long random string (you'll paste the same one in Lovable)
5. In MongoDB Atlas → Network Access → add `0.0.0.0/0` (or Render's egress IPs).
6. Deploy. Copy the URL, e.g. `https://mongo-proxy-xyz.onrender.com`.

## Same flow works on Railway / Fly.io

Just set the same three env vars and expose port `3000`.

## Endpoints

- `GET  /health` → `{ ok: true }`
- `POST /search` body `{ "collection": "personnes", "filter": { "nom": "Bochra" } }`

All requests require header `Authorization: Bearer <PROXY_API_KEY>`.