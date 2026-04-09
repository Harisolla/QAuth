# Q-Auth Platform

Q-Auth Platform is a full-stack demo app with a React frontend and a Django REST backend for quantum-inspired authentication flows.

## Project Structure

- `frontend/`: React + Vite client
- `backend/`: Django API and admin

## Local Development

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

### Backend

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

The frontend dev server proxies `/api`, `/admin`, and `/static` requests to Django.

## Environment Variables

Create `backend/.env` or configure these in your hosting provider:

```env
DEBUG=False
SECRET_KEY=change-me
ALLOWED_HOSTS=your-app.onrender.com
CSRF_TRUSTED_ORIGINS=https://your-app.onrender.com
CORS_ALLOWED_ORIGINS=https://your-app.onrender.com
DATABASE_URL=postgres://...
REDIS_URL=redis://...
```

If `DATABASE_URL` is not set, the app falls back to SQLite for local use. If `REDIS_URL` is not set, the app falls back to Django's local-memory cache.

## Deploying

This repo includes a `Dockerfile`, `.dockerignore`, and `render.yaml` so you can deploy the whole app as one service on Render.

### GitHub

```powershell
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/q-auth-platform.git
git push -u origin main
```

### Render

1. Push this repo to GitHub.
2. In Render, create a new Blueprint or Web Service from the repo.
3. Add `SECRET_KEY` and any optional env vars.
4. Deploy.

If you want a persistent production database, attach a PostgreSQL instance and set `DATABASE_URL`.
