# Listen address from listenHost (project-standards#898)

- `backend/src/server.ts` passes `listenHost(auth !== undefined)` to `listen`: the managed helper from `standard/auth.ts` (#866) gives `HOST` if set, all interfaces when the shared sign-in is on, and 127.0.0.1 when it is off.
- On the server compose sets `AUTH_INTERNAL_URL`, so the API still listens on 0.0.0.0 behind the proxy; only a local run without a sign-in becomes private.
- Verification: typecheck and eslint; after the merge the deploy must still answer through the proxy (health 200).
