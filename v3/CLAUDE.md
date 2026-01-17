# CLAUDE.md - Complens Android App

## What is Complens?

Complens is a **local-first Android app** that shows users what third-party apps have access to their Google account. All data stays on the device - no cloud storage required.

**Core Value Prop**: "See everything that has access to your Google account. In 30 seconds. 100% private."

## Architecture

```
┌─────────────────────────────────────────────┐
│              ANDROID APP                     │
│  ┌─────────────────────────────────────────┐│
│  │     React + TypeScript UI               ││
│  │     (mobile-first, TailwindCSS)         ││
│  └─────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────┐│
│  │     Capacitor (native bridge)           ││
│  │  ┌────────────┐ ┌────────────────────┐  ││
│  │  │  SQLite    │ │  Google Sign-In    │  ││
│  │  │  (local)   │ │  (native OAuth)    │  ││
│  │  └────────────┘ └────────────────────┘  ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
         │
         │ Direct API calls (no middleman)
         ▼
┌─────────────────────────────────────────────┐
│         GOOGLE APIs                          │
│  - Drive API (list connected apps)          │
│  - OAuth2 token info                        │
│  - User info                                │
└─────────────────────────────────────────────┘
```

## What's LOCAL (no cloud needed)

| Feature | Storage |
|---------|---------|
| User profile | SQLite on device |
| Google account tokens | SQLite on device |
| Discovered apps list | SQLite on device |
| Risk scores | Calculated on device |
| Scan history | SQLite on device |

## What's OPTIONAL (cloud features)

| Feature | Requires |
|---------|----------|
| AI chat | AWS Bedrock |
| Cross-device sync | DynamoDB + encryption |
| Push notifications | FCM + Lambda |

**The core app works 100% offline after initial Google sign-in.**

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI | React 18 + TypeScript + TailwindCSS |
| Native Wrapper | Capacitor 5 |
| Local Database | SQLite via @capacitor-community/sqlite |
| Auth | Google Sign-In via @codetrix-studio/capacitor-google-auth |
| State | Zustand |
| Icons | Lucide React |

## Project Structure

```
v3/frontend/
├── src/
│   ├── App.tsx                    # Router + auth check
│   ├── main.tsx                   # Entry point + native init
│   ├── index.css                  # TailwindCSS + design system
│   ├── components/
│   │   ├── Layout.tsx             # App shell with bottom nav
│   │   └── ui/                    # Reusable component library
│   ├── pages/
│   │   ├── Login.tsx              # Google sign-in screen
│   │   ├── Dashboard.tsx          # Home with risk overview
│   │   ├── Accounts.tsx           # Connected accounts
│   │   ├── Apps.tsx               # Discovered apps list
│   │   └── Settings.tsx           # Preferences
│   ├── services/
│   │   ├── db.ts                  # Local SQLite database
│   │   └── google.ts              # Google auth + API calls
│   └── stores/
│       └── appStore.ts            # Zustand global state
├── capacitor.config.ts            # Native app config
├── package.json
└── android/                       # Generated Android project
```

## Development Commands

```bash
# Install dependencies
cd v3/frontend
npm install

# Run in browser (development)
npm run dev

# Build for production
npm run build

# Initialize Capacitor (first time only)
npm run cap:init
npm run cap:add   # Adds Android platform

# Sync web code to Android
npm run cap:sync

# Open Android Studio
npm run cap:open

# Build and run on Android
npm run android:run
```

## Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select project "its-complens"
3. Go to APIs & Services → Credentials
4. Create OAuth 2.0 Client ID:
   - Type: Android
   - Package name: `ai.complens.app`
   - SHA-1: Get from `keytool -list -v -keystore ~/.android/debug.keystore`
5. Also create Web client ID (needed for Capacitor plugin)
6. Enable APIs:
   - Google Drive API
   - Google People API

## Environment Variables

Create `.env` in `v3/frontend/`:

```
VITE_GOOGLE_WEB_CLIENT_ID=xxx.apps.googleusercontent.com
```

Update `capacitor.config.ts` with the same client ID.

## Local Database Schema

```sql
-- User profile (single row)
profile: id, google_id, email, name, picture, settings, created_at

-- Connected accounts
accounts: id, platform, email, access_token, refresh_token, scopes, status, last_scanned_at

-- Discovered apps
apps: id, account_id, name, client_id, scopes, permissions, risk_level, risk_score

-- Scan history
scans: id, account_id, status, apps_found, high_risk, medium_risk, low_risk
```

## Risk Scoring

| Risk Level | Criteria |
|------------|----------|
| **High** | Can read/write email, contacts, calendar, or files |
| **Medium** | Read-only access to sensitive data |
| **Low** | Basic profile access only |

Scopes that trigger HIGH risk:
- `mail.google.com`, `gmail.modify`, `gmail.send`
- `drive` (full access), `calendar`, `contacts`

## Roadmap

### Phase 1: MVP (Current)
- [x] Capacitor Android wrapper
- [x] Local SQLite database
- [x] Google Sign-In (native)
- [x] Google Drive API integration
- [x] Risk scoring algorithm
- [x] UI component library
- [ ] Build and test on Android device

### Phase 2: Discovery
- [ ] Gmail connected apps
- [ ] Calendar connected apps
- [ ] Google Account permissions page deep-link
- [ ] Manual app review flow

### Phase 3: Actions
- [ ] "Review on Google" button (deep-links to Google's page)
- [ ] Track revocation status
- [ ] Scan scheduling

### Phase 4: Expansion
- [ ] Microsoft account support
- [ ] GitHub account support
- [ ] Facebook account support

### Phase 5: Cloud Features (Optional)
- [ ] AI chat (Bedrock)
- [ ] Cross-device sync (encrypted)
- [ ] Push notifications

---

## Privacy First

- **No cloud required** for core functionality
- **No tracking** or analytics
- **No data leaves device** unless user explicitly syncs
- **Open source** (future)

This is not a "freemium" app that harvests data. It's a privacy tool that respects privacy.
