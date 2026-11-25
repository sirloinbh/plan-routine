# 311: Pass the VAPID keys to the api service in compose

Issue: [#311](https://github.com/sirloinbh/plan-routine/issues/311).

## Why

The Web Push sender (#249) reads `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. Compose forwards only listed variables.

## Changes

- `compose.yaml`: the three variables on the `api` service as `${VAR:-}`, like `AI_TOOLS_PUBLIC_KEY`. Unset means empty, so the feature stays off.

## Verification

See the PR.
