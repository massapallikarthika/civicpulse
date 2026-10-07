---
name: Supabase Node runtime
description: Runtime requirement for initializing the Supabase JavaScript client in CivicPulse.
---

CivicPulse must use Node.js 22 or later with the current Supabase SDK. Even when the app does not use Realtime, `createClient()` constructs the Realtime client and fails on Node 20 because native `WebSocket` is unavailable.

**Why:** Registration returned HTTP 500 before any Auth request was sent; the server log identified the missing native WebSocket constructor. Switching to Node 22 resolved client initialization.

**How to apply:** Keep the Replit Node module at 22+ and check `typeof WebSocket` plus a non-mutating Auth request after changing the runtime.
