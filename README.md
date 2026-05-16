# EarthPol Discord Bot

Discord companion bot for EarthPol live data, Toolkit data, role sync, vote-party alerts, shop search, nation/town lookups, and staff utilities.

## Setup

```bash
npm install
npm run check
npm start
```

## Environment

```env
DISCORD_TOKEN=
CLIENT_ID=

API_BASE_URL=https://api.earthpol.com/astra
SHOP_API=https://api.earthpol.com/astra/shops
LOCATION_API=https://api.earthpol.com/astra/location
PLAYERS_API=https://api.earthpol.com/astra/players
PLAYERS_LIST_API=https://api.earthpol.com/astra/players
NATIONS_API=https://api.earthpol.com/astra/nations
TOWNS_API=https://api.earthpol.com/astra/towns
DISCORD_LINK_API=https://api.earthpol.com/astra/discord
CHAT_API=https://api.earthpol.com/astra/chat
VOTE_API_URL=https://api.earthpol.com/astra/voting

# Optional overrides. Defaults are https://earthpol.org and https://earthpol.org/api.
TOOLKIT_BASE_URL=https://earthpol.org
TOOLKIT_API_BASE=https://earthpol.org/api/

TOOLKIT_FOOTER=EarthPol Toolkit
SYNC_INTERVAL_MS=600000
```

## Modernized Commands

- `/t info` and `/nation info` show town/nation flags from `cdn.earthpol.com`, cleaner stats, and Toolkit/map/flag buttons.
- `/res` shows player busts, nation flags, profile links, and ban-history links.
- `/shop market` and `/shop traderoutes` use the Toolkit API for market depth and arbitrage routes.
- `/kitpvp leaderboard` and `/kitpvp profile` use Toolkit KitPvP cache endpoints.
- `/siege list` uses Toolkit SiegeWar cache endpoints.
- `/toolkit show` summarizes per-guild role, nation, admin, and vote-party config.

## Toolkit Feature Ideas

- Nation and town "risk" cards: combine Astra Towny state with Toolkit inactivity, balance history, and SiegeWar data.
- Market alerts: let users watch item stacks and receive Discord alerts when best sell or buy prices cross a threshold.
- Trade-route watchlists: save profitable routes and notify when stock, space, or owner balance makes them executable.
- Siege weekend digest: summarize active/stale sieges, banner control swings, session progress, and leader identities.
- Economy movement reports: compare player/town/nation balance deltas over 24h/7d using Toolkit history endpoints.
- Role-sync preview: show which Discord users would gain or lose Citizen/Allied/Enemy/Linked roles before applying sync.
