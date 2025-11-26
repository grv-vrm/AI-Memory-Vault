# AI Memory Vault - Frontend

A minimal, polished React application for the AI Memory Vault with authentication, file upload, and chat functionality.

## Tech Stack

- **Framework**: React 19 + Vite
- **Routing**: React Router DOM
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui
- **Runtime**: Bun
- **Language**: TypeScript

## Features

### Authentication
- Email/password login and registration
- Google OAuth sign-in (via backend)
- Cookie-based session management (httpOnly cookies)
- Protected routes with automatic redirects

### File Upload
- Presigned URL upload flow (presign → PUT → complete)
- Real-time upload progress tracking
- File status monitoring (uploaded → processing → done/failed)
- Supports: PDF, PNG, JPG, JPEG, MP4

### Chat Interface
- Clean, responsive two-column layout
- Message composer with file attachment support
- File list panel with status indicators
- Auto-polling for file status updates

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn components
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── label.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── badge.tsx
│   │   │   └── progress.tsx
│   │   ├── AuthForm/        # Authentication forms
│   │   │   ├── LoginForm.tsx
│   │   │   └── RegisterForm.tsx
│   │   └── Chat/            # Chat UI components
│   │       ├── ChatWindow.tsx
│   │       ├── Composer.tsx
│   │       ├── FileList.tsx
│   │       ├── UploadButton.tsx
│   │       └── FileItem.tsx
│   ├── lib/
│   │   ├── auth.ts          # Authentication helpers
│   │   ├── upload.ts        # File upload helpers
│   │   └── utils.ts         # Utility functions
│   ├── pages/
│   │   ├── LoginPage.tsx    # Login/Register page
│   │   ├── ChatPage.tsx     # Main chat interface
│   │   └── AuthSuccess.tsx  # OAuth callback handler
│   ├── api.ts               # Base API fetch wrapper
│   ├── App.tsx              # Router and auth logic
│   ├── main.tsx             # Entry point
│   └── index.css            # Global styles + theme
├── .env                     # Environment variables
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Environment Variables

Create a `.env` file in the frontend directory:

```env
VITE_API_URL=http://localhost:5000
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_BUCKET=your_bucket_name
```

## Backend Integration

### API Endpoints Used

#### Authentication
- `POST /auth/register` - Create new account
- `POST /auth/login` - Sign in with email/password
- `GET /auth/google` - Initiate Google OAuth flow
- `POST /auth/logout` - Sign out
- `GET /user/me` - Get current user (requires cookie)

#### File Upload
- `POST /upload/presign` - Get presigned upload URL
- `POST /upload/complete` - Complete upload and enqueue processing
- `GET /user/files` - List user's files with statuses

### Cookie-Based Auth
All API requests use `credentials: "include"` to send httpOnly cookies. The backend sets these cookies on successful login.

### Upload Flow
1. **Presign**: Request signed URL from backend
2. **Upload**: Direct PUT to storage (Supabase)
3. **Complete**: Notify backend to enqueue processing job
4. **Poll**: Auto-refresh file list to show status updates

## Development

### Install Dependencies
```bash
bun install
```

### Run Development Server
```bash
bun run dev
```

### Build for Production
```bash
bun run build
```

### Preview Production Build
```bash
bun run preview
```

## Usage

### Login Flow
1. Navigate to `/login`
2. Choose "Sign In" or "Register" tab
3. Enter credentials or click "Sign in with Google"
4. On success, redirects to `/chat`

### Upload Flow
1. Click "Upload File" in the files panel
2. Select a file (PDF, image, or video)
3. Watch upload progress
4. File appears with "uploaded" status
5. Backend worker processes file → status changes to "processing" → "done"

### Chat
- Type messages in the composer
- Messages appear in the chat window
- Backend integration ready (placeholder responses currently)

## Styling & Theme

### Color Scheme
- **Primary**: Dark blue (`oklch(0.35 0.15 250)`)
- **Accent**: Emerald for success states
- **Background**: Clean white (light mode) or dark slate (dark mode)

### Responsive Design
- Desktop: Two-column layout (files | chat)
- Mobile: Stacked layout with floating file button

## Security Notes

- **Never** store tokens or secrets in frontend code
- All auth happens via httpOnly cookies
- Supabase anon key is safe to expose (read-only operations)
- Service role keys must stay on backend only

## Future Enhancements

- [ ] Implement actual chat API integration
- [ ] Add file delete functionality
- [ ] File download links
- [ ] Message history persistence
- [ ] Mobile file panel drawer/dialog
- [ ] Toast notifications for errors/success
- [ ] Typing indicators
- [ ] File preview
- [ ] Dark mode toggle

## Troubleshooting

### CORS Errors
Ensure backend has correct CORS configuration with:
```javascript
credentials: true
origin: process.env.FRONTEND_ORIGIN
```

### Cookie Not Sent
Check that:
1. `credentials: "include"` is set in fetch calls
2. Backend sets `httpOnly`, `secure`, `sameSite` correctly
3. Frontend and backend are on same domain or proper CORS setup

### Files Not Updating
- File status polling happens every 3 seconds
- Check browser console for API errors
- Verify backend worker is running

## License

Private project - AI Memory Vault
