# WeMatch — Full-Stack MVP

> **Matched by the people who know you best.**

Social-first dating platform where your trusted inner circle makes introductions.

---

## 🏗 Architecture

```
wematch/
├── backend/
│   ├── server.js          # Express entry point
│   ├── config/
│   │   └── database.js    # SQLite connection (better-sqlite3)
│   ├── middleware/
│   │   └── auth.js        # JWT verification middleware
│   └── routes/
│       ├── auth.js        # register, login, refresh, logout, /me
│       ├── users.js       # profile update, public profile, search
│       ├── circles.js     # circle invites, accept/decline, list
│       ├── referrals.js   # create referral, accept/decline (double opt-in)
│       └── matches.js     # match list, thread, send message
├── frontend/
│   └── public/
│       └── index.html     # Landing page + auth modal + dashboard (SPA)
├── scripts/
│   ├── migrate.js         # Creates all DB tables
│   └── seed.js            # Demo data (5 test users)
├── .env.example
├── package.json
└── README.md
```

---

## ⚡ Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env — set JWT_SECRET to a long random string
```

### 3. Run migrations
```bash
npm run db:migrate
```

### 4. (Optional) Seed demo data
```bash
npm run db:seed
```

### 5. Start the server
```bash
npm run dev        # development (nodemon auto-reload)
npm start          # production
```

Visit `http://localhost:3000`

---

## 🔌 API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account `{ name, email, password }` |
| POST | `/api/auth/login` | Login `{ email, password }` → `{ user, accessToken, refreshToken }` |
| POST | `/api/auth/refresh` | Refresh access token `{ refreshToken }` |
| POST | `/api/auth/logout` | Invalidate refresh token |
| GET  | `/api/auth/me` | Current user profile |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| PATCH | `/api/users/profile` | Update own profile |
| GET   | `/api/users/:id` | Public profile |
| GET   | `/api/users?q=name` | Search users |

### Circles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/api/circles` | My circle + circles I'm in |
| POST   | `/api/circles/invite` | Invite someone `{ member_id }` |
| POST   | `/api/circles/:id/accept` | Accept circle invite |
| POST   | `/api/circles/:id/decline` | Decline circle invite |
| DELETE | `/api/circles/:id` | Remove from circle |

### Referrals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/referrals` | Received + sent referrals |
| POST | `/api/referrals` | Create referral `{ recipient_id, candidate_id, note }` |
| POST | `/api/referrals/:id/accept` | Accept (triggers match on double opt-in) |
| POST | `/api/referrals/:id/decline` | Decline |

### Matches
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/matches` | All my matches with last message |
| GET  | `/api/matches/:id` | Single match detail |
| GET  | `/api/matches/:id/messages` | Message thread |
| POST | `/api/matches/:id/messages` | Send message `{ body }` |

---

## 🚀 Deployment

### Vercel
```bash
npm install -g vercel
vercel
# Set environment variables in Vercel dashboard
```
Add `vercel.json`:
```json
{
  "version": 2,
  "builds": [{ "src": "backend/server.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "backend/server.js" }]
}
```

### Railway
```bash
npm install -g @railway/cli
railway login
railway init
railway up
# Set env vars: JWT_SECRET, NODE_ENV=production, DB_PATH=/data/wematch.db
```

### Render
1. Connect GitHub repo at render.com
2. Build command: `npm install && npm run db:migrate`
3. Start command: `npm start`
4. Add environment variables in dashboard

### Fly.io
```bash
npm install -g flyctl
fly launch
fly secrets set JWT_SECRET=your_secret NODE_ENV=production
fly deploy
```

---

## 🗄 Database

Uses **SQLite** via `better-sqlite3` — zero config, file-based, production-ready for early-stage apps.

To migrate to **PostgreSQL** (e.g. when scaling):
1. Replace `better-sqlite3` with `pg`
2. Update `backend/config/database.js` to use a connection pool
3. SQL syntax is standard — minimal changes needed

**Tables:** `users` · `refresh_tokens` · `circles` · `referrals` · `matches` · `messages` · `trust_badges`

---

## 🔒 Security

- **Passwords:** bcrypt (12 rounds)
- **Auth:** JWT access tokens (7d) + refresh tokens (30d)
- **Rate limiting:** 100 req/15min on API; 10 req/15min on auth
- **Headers:** Helmet.js (CSP, HSTS, etc.)
- **Input validation:** express-validator on all mutating endpoints
- **CORS:** Allowlist-based

---

## 📋 Next Steps

- [ ] **Real-time chat** — add `socket.io` to the server, messages API is already built
- [ ] **Email notifications** — plug in Resend/Postmark; SMTP vars are in `.env.example`
- [ ] **Photo uploads** — `multer` is installed; wire to `/api/users/avatar`
- [ ] **Push notifications** — Web Push API for mobile-web
- [ ] **Stripe** — add `/api/subscriptions` for Premium/Elite tiers
- [ ] **Mobile app** — React Native / Expo; REST API is fully compatible

---

## 🧪 Demo Accounts (after seeding)

| Email | Password |
|-------|----------|
| alex@demo.com | password123 |
| jordan@demo.com | password123 |
| sam@demo.com | password123 |
| morgan@demo.com | password123 |
| taylor@demo.com | password123 |
