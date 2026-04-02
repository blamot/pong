# Pong (with a phone controller)

Welcome to **Pong**, a neon-styled, party-friendly twist on the classic arcade game. One screen hosts the match, and any phone can become the controller by scanning a QR code. It is simple, fast to set up, and surprisingly addictive.

## What is this?

- **Host view**: the main game runs in the browser with a crisp canvas display.
- **Phone controller**: open the QR link on any phone to control the paddle.
- **Motion or touch**: swipe on the touchpad or enable motion control to tilt your way to glory.

If you want a quick “drop a tablet on the table and let people play” experience, this is it.

## How it works

The host and controller talk over WebSockets (Socket.IO). When the host page loads it creates a short room ID, generates a QR link, and the controller joins that room. The rest is smooth paddle action.

## Run it locally

```bash
npm install
npm start
```

Then open:

- Host: `http://localhost:3001/game`
- Controller: `http://localhost:3001/controller` (or scan the QR from the host view)

> Note: the default port is 3001. You can override it with `PORT=xxxx`.

## Deploying behind a path (example: `/pong`)

This project is friendly to reverse proxies and path prefixes. If you mount it at `https://example.com/pong`, the app will keep its assets and Socket.IO path under `/pong` automatically.

## Controls

- **Keyboard** (host): W/S or ↑/↓
- **Phone**: drag up/down on the touchpad
- **Motion control**: toggle it on and tilt your phone

## Why you might love it

- Zero setup for players: just scan and play
- Works on phones, tablets, and desktops
- Great for demos, hack nights, or a living room showdown

Have fun, and may your paddle always be in the right place.
