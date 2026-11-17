# Darkout

**Lights out. Signal on.** A Solana memecoin built around a pocket survival kit for power cuts.

[![Live site](https://img.shields.io/website?url=https%3A%2F%2Fdarkout.xyz&label=darkout.xyz&style=flat-square)](https://darkout.xyz)
![Chain](https://img.shields.io/badge/chain-Solana-fad822?style=flat-square)

**Contract address:** `TBA` (the site shows an empty slot and keeps every buy link inert until an address is published)

## Overview

Darkout pairs a community coin with a long-term build: a toolkit that keeps helping people when the grid and the network go quiet. The site is a static page with a live Solana market board that runs independently of the coin's own status.

## Features

- Always-visible, click-to-copy contract address slot (inert until stated)
- Live market board: top boosted Solana tokens, polled every 60 seconds, paused while the tab is hidden, with backoff and last-good-data retention
- Own-token row pinned first, fed in parallel by DexScreener and pump.fun once the address is stated
- Register-driven links: nothing renders as a link unless its record is stated
- Spring-physics reveals, hero parallax, spotlight hover, scroll progress, and a full reduced-motion fallback

## Links

- Site: https://darkout.xyz
- X: https://x.com/Darkoutxyz
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)

## Development

```bash
npm install
npm run build     # writes the deploy output to dist/
npm run verify    # static gates against dist/
npm run mutate    # mutation harness: every gate must catch its mutation
```

Facts live in `src/register.json` (state: `stated`, `absent`, or `unconfirmed`). To announce the contract address, set `ca` to `{ "state": "stated", "value": "<address>" }` and rebuild.

## License

MIT
