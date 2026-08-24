# Let's Play — Modular Project Structure

## Files

```
letsplay/
├── index.html          ← Main HTML (markup only, no inline JS/CSS)
├── css/
│   ├── base.css        ← Layout, components, variables, responsive
│   └── premium.css     ← Premium design overrides (glassmorphism, gradients)
├── js/
│   ├── firebase.js     ← Firebase init, logger, connectivity check
│   ├── auth.js         ← Login, register, logout, onLoggedIn, auth state
│   ├── profile.js      ← Photo upload, save profile, presence, search, avatarHTML
│   ├── ui.js           ← refreshHome, renderLeaderboard, renderHistory, renderProfile, header
│   ├── chat.js         ← initChat, sendChat, quickMsg, escapeHtml
│   ├── matchmaking.js  ← Auto match, lobby, score submission, result confirmation
│   ├── nav.js          ← go(), showMS(), toast(), drawer, swipe gestures, setInterval
│   ├── challenges.js   ← Full challenge system (create, accept, submit, ELO, feed, notifs)
│   └── rps.js          ← Rock-Paper-Scissors multiplayer mini-game
└── README.md
```

## Script Load Order

Scripts must load in this order (dependencies flow top to bottom):

1. Firebase SDKs (external CDN)
2. `firebase.js` — initializes `db`, `auth`, `dlog()`
3. `auth.js` — uses `db`, `auth`
4. `profile.js` — uses `db`, `me`, `avatarHTML`
5. `ui.js` — uses `db`, `me`, rendering helpers
6. `chat.js` — uses `db`, `me`, `lobbyCode`
7. `matchmaking.js` — uses `db`, `me`, `initChat`, `showFoundMatch`
8. `nav.js` — uses all render functions + `go()`
9. `challenges.js` — uses `db`, `me`, `go`, `avatarHTML`, ELO
10. `rps.js` — uses `db`, `me`, `go`, `toast`

## Shared Global State

All modules share these global variables (declared in their respective modules):

| Variable | Declared in | Used by |
|---|---|---|
| `me` | `firebase.js` | all |
| `db`, `auth` | `firebase.js` | all |
| `lobbyCode`, `opponent` | `matchmaking.js` | `chat.js`, `matchmaking.js` |
| `rpsGameId`, `rpsRole` | `rps.js` | `rps.js`, `nav.js` |

## Deployment

Upload the entire `letsplay/` folder to GitHub Pages or any static host.
The entry point is `index.html`.
