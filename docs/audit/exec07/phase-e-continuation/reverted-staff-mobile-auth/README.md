# Reverted: staff-plane refresh token in the body for `x-oryx-client: mobile`

These two files are the working-tree edits the crashed session left behind on
`feature/execution-07-premium-web`. They were **reverted**, not shipped, during
the Execution 07 Phase E continuation.

- `auth.controller.ts` — belongs at `apps/api/src/auth/auth.controller.ts`
- `mobile-native-session.e2e-spec.ts` — belongs at `apps/api/test/mobile-native-session.e2e-spec.ts`

## What the change did

`completeLogin` gained an `exposeRefreshToken` flag. When a request carried
`x-oryx-client: mobile`, `POST /auth/login`, `POST /auth/mfa/verify-login` and
`POST /auth/refresh` returned the staff refresh token in the JSON body instead of
only setting the HttpOnly cookie. The attached test passed 7/7, including the
guard that a browser request still never sees the token.

## Why it was not shipped

1. No client uses it. `apps/mobile` calls the consumer plane
   (`/customer/auth/*`) exclusively; there is no ERP mobile app in the repo.
2. It contradicts a documented non-negotiable baseline: the staff refresh token
   is never returned in a response body. Broadening that is an owner security
   decision, not part of a light-theme correction.
3. It is outside Execution 07's scope.

## To restore

```bash
cp auth.controller.ts                 ../../../../apps/api/src/auth/auth.controller.ts
cp mobile-native-session.e2e-spec.ts  ../../../../apps/api/test/mobile-native-session.e2e-spec.ts
```

The customer-plane equivalent already exists on `HEAD` from commit `fecabed`.
