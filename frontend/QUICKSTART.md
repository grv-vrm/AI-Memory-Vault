# Quick Start Guide - AI Memory Vault Frontend

## Installation & Setup

### 1. Environment Configuration
The `.env` file is already configured:
```env
VITE_API_URL=http://localhost:5000
VITE_SUPABASE_URL=https://aqvabqjmjfpxspgljzla.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_tRms-6j-HD0oaTOZOppSeQ_r88haFTy
VITE_SUPABASE_BUCKET=aimemoryvault
```

### 2. Start Development Server
```bash
cd frontend
bun install  # if not already done
bun run dev
```

The app will run at `http://localhost:5173` (default Vite port).

### 3. Backend Requirements
Ensure the backend is running at `http://localhost:5000` with:
- CORS enabled for `http://localhost:5173`
- Cookie credentials allowed
- All endpoints implemented as per spec

## Application Flow

### First-Time User Journey

1. **Landing** → App checks auth via `GET /user/me`
2. **Not Authenticated** → Redirects to `/login`
3. **Login Page** → User can:
   - Sign in with email/password
   - Register new account
   - Sign in with Google OAuth
4. **Authentication Success** → Redirects to `/chat`
5. **Chat Page** → User sees:
   - Files panel (left) with upload button
   - Chat window (center/right) with composer

### Upload Workflow

```
User clicks "Upload File"
  ↓
Select file from disk
  ↓
Frontend: POST /upload/presign
  ← Backend: { signedUploadUrl, path }
  ↓
Frontend: PUT to signedUploadUrl (direct to Supabase)
  → Shows progress bar (0-100%)
  ↓
Frontend: POST /upload/complete { path, filename, mimeType, size }
  ← Backend: { file: { id, status: "uploaded" } }
  ↓
File appears in list with "uploaded" badge
  ↓
Backend worker picks up job → status: "processing"
  ↓
File processed → status: "done" (or "failed")
```

The frontend auto-polls `GET /user/files` every 3 seconds to update statuses.

## Key Files & Their Purpose

| File | Purpose |
|------|---------|
| `src/App.tsx` | Router, auth check, protected routes |
| `src/api.ts` | Base fetch wrapper with credentials |
| `src/lib/auth.ts` | Login, register, logout, getCurrentUser |
| `src/lib/upload.ts` | Upload flow helpers (presign, PUT, complete) |
| `src/pages/LoginPage.tsx` | Login/register UI with tabs |
| `src/pages/ChatPage.tsx` | Main app: files + chat |
| `src/components/Chat/*` | Modular chat UI components |

## Testing Checklist

### Authentication
- [ ] Register new user → redirects to chat
- [ ] Login with existing user → redirects to chat
- [ ] Google sign-in → OAuth flow → returns to `/auth/success` → redirects to chat
- [ ] Access `/chat` while logged out → redirects to `/login`
- [ ] Logout → clears session → redirects to `/login`

### File Upload
- [ ] Upload PDF → shows progress → completes → appears in list
- [ ] Upload image → same flow
- [ ] Upload video → same flow
- [ ] Backend processes file → status changes from "uploaded" to "processing" to "done"
- [ ] Failed upload → shows error message with retry option

### Chat
- [ ] Send message → appears in chat window
- [ ] Placeholder assistant response shows
- [ ] Messages scroll to bottom automatically

## Common Issues

### "CORS error" when calling API
**Fix**: Backend must allow credentials and origin:
```javascript
cors({
  origin: 'http://localhost:5173',
  credentials: true
})
```

### "Cookie not sent with request"
**Fix**: Ensure `credentials: "include"` in all `apiFetch` calls (already done).

### "Upload fails at PUT step"
**Fix**: Check that Supabase signed URL is valid and bucket permissions allow uploads.

### "File status never changes from 'uploaded'"
**Fix**: Check that backend worker is running and processing jobs.

## Next Steps

After verifying the frontend works:

1. **Implement Chat Backend**
   - Add `POST /chat/message` endpoint
   - Return AI-generated responses
   - Use uploaded file context for retrieval

2. **Enhanced Features**
   - File download links
   - Delete files
   - Toast notifications
   - Dark mode toggle
   - Message history persistence

3. **Production Deployment**
   - Build: `bun run build`
   - Deploy `dist/` folder to static host
   - Update `VITE_API_URL` to production backend
   - Ensure CORS allows production origin

## Architecture Decisions

### Why Cookie-Based Auth?
- More secure than localStorage tokens
- HttpOnly cookies can't be accessed by JavaScript
- Automatic inclusion in requests
- Protection against XSS attacks

### Why Direct Upload to Supabase?
- Reduces backend load
- Faster uploads (direct to CDN)
- Better progress tracking
- Backend only orchestrates, doesn't proxy files

### Why Polling for File Status?
- Simple to implement
- Works reliably
- Low frequency (3s) = acceptable load
- Can upgrade to WebSockets/SSE later if needed

## Component Design Principles

- **Small & Focused**: Each component has single responsibility
- **Reusable**: UI components in `components/ui/`
- **Modular**: Easy to swap chat/upload implementations
- **Type-Safe**: Full TypeScript with proper interfaces
- **Accessible**: Semantic HTML + ARIA where needed

---

**Ready to go!** Start both backend and frontend, navigate to `http://localhost:5173`, and test the complete flow.
