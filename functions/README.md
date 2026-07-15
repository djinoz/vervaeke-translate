# Server-side mutation layer placeholder

This project intends to use **trusted server code** for:
- publication / moderation state transitions
- email approval links
- CAPTCHA verification
- anti-spam rate-limit / tarpitting decisions

Recommended options:
- Firebase Cloud Functions
- or Cloud Run if you want more control over runtime / libraries

Nothing is implemented here yet. This folder exists so the repo already reflects the intended architecture from day one.
