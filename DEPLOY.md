# Deploying pollar

Backend runs on **Render** (R/Plumber in Docker). Frontend runs on **Vercel** (Vite/React) and talks to the backend via `VITE_API_BASE_URL`.

## 1. Deploy backend on Render

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. In [Render](https://render.com), go to **Dashboard → New → Web Service**.
3. Connect the repository.
4. Render can use the repo’s **Blueprint**:
   - **New → Blueprint** and connect the same repo.
   - Render will read `render.yaml` and create the `pollar-api` web service.
5. If you create the service manually instead:
   - **Runtime:** Docker  
   - **Dockerfile path:** `backend/Dockerfile`  
   - **Docker build context:** `.` (repo root)  
   - **Health check path:** `/health`
6. Deploy. After the first successful deploy, note the service URL (e.g., `https://pollar-api.onrender.com`).

Render sets `PORT` automatically; the backend already uses it.

## 2. Deploy frontend on Vercel

1. In [Vercel](https://vercel.com), **Add New → Project** and import the same repo.
2. Set **Root Directory** to `frontend` (so the app is built from the Vite project).
3. Vercel will detect Vite; build command `npm run build` and output `dist` are fine by default.
4. Add an **Environment Variable** (Production and Preview if you want):
   - **Name:** `VITE_API_BASE_URL`  
   - **Value:** your Render backend URL, e.g., `https://pollar-api.onrender.com`  
   (No trailing slash.)
5. Deploy.

The frontend will call the Render API at the URL you set. The `frontend/vercel.json` rewrites ensure client-side routing works and `/data/*` static files are still served.

## 3. Map data

The projection map needs GeoJSON. Add `frontend/public/data/federal-districts-2025.geojson` (see `frontend/public/data/README.md`). Commit and push so Vercel serves it.

## Summary

| Part     | Platform | URL / config |
|----------|----------|----------------|
| Backend  | Render   | e.g., `https://pollar-api.onrender.com` |
| Frontend | Vercel   | Set env `VITE_API_BASE_URL` to the backend URL above |

## Build and run locally

Start the backend with `Rscript run_api.R` from `backend/`, then run the frontend with `npm run dev` from `frontend/` (default API base is `http://localhost:8000`).
