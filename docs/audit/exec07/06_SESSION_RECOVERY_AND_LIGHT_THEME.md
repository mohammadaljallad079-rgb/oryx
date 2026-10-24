# Execution 07 — Session recovery after the sandbox failure

The previous conversation ended with:

> Sandbox error — This conversation's sandbox encountered an error. The history
> above is read-only.

This is the recovery record. It states what is on the remote, what was
recovered, and what was genuinely lost.

## Repository state at recovery

| Item | Value |
| --- | --- |
| Repository | `mohammadaljallad079-rgb/oryx` |
| Branch | `feature/execution-07-premium-web` |
| Local `HEAD` | `2e3e93e0892d6925799c240f4a3b5bd276423748` |
| `origin/feature/execution-07-premium-web` | `2e3e93e0892d6925799c240f4a3b5bd276423748` |
| Last confirmed push (owner-supplied) | `b3c9a71eaeaea0eb4ae5aa1ab141a1511a10de37` |
| PR #7 | open, draft, head `2e3e93e`, base `audit/execution-05-verification`, not merged |
| PR #6 | open, not draft, not merged |

Local and remote are identical, so the crashed session **did push** beyond
`b3c9a71`. `b3c9a71` is an ancestor of `HEAD`; nothing was reset or rewritten.

## Commits the crashed session pushed beyond `b3c9a71`

The work is intact on the remote. The last five are the ones the crash
interrupted:

```
2e3e93e test(exec11): add a live acceptance harness for RBAC, internal companies and accounting
2b31e9b fix(theme): unify the light-theme gold and finish centralising light tokens
99b0914 fix(entitlements): stop plan-limiting internal companies
e99410a chore(exec11): preserve the crashed session's helper scripts
180ebf8 docs(exec11): recover the crashed session and publish the light-theme evidence
```

All of the following are present on `HEAD` and were not lost:

- The premium website and CMS work (Execution 07 Phases A–D).
- The real automotive photography: 30 committed images under
  `apps/customer/public/media/`, each with `-lg`/`-sm` responsive variants.
- The category fixes.
- Authentication and security work (HttpOnly refresh cookies, CSRF
  double-submit, TOTP MFA).
- The Execution 07 Phase E light-theme correction, including the admin light
  theme move to the ivory identity (`1897db0`) and the gold unification
  (`2b31e9b`).

## Unpushed work

Nothing that was pushed is missing. The only files not on the remote are the
uncommitted edits in the working tree at recovery:

| File | State |
| --- | --- |
| `apps/api/src/auth/auth.controller.ts` | modified (native-client refresh token in the body for `x-oryx-client: mobile`) |
| `apps/api/test/mobile-native-session.e2e-spec.ts` | untracked |
| `scripts/seed-mobile-demo.mjs` | untracked |

These are the mobile-integration task, not Execution 07. They are unrelated to
the light theme.

### Decision on the staff-plane auth edit

The two `apps/api` files were reverted, not shipped. The change let
`POST /auth/login` (and the MFA and refresh paths) return the staff refresh
token in the response body whenever a caller sent `x-oryx-client: mobile`. That
is a real feature for a native ERP client — but:

- the repository has no ERP mobile client. `apps/mobile` talks only to the
  consumer plane (`/customer/auth/*`), which already has this contract on
  `HEAD` from `fecabed`;
- the change contradicts a documented non-negotiable: *"The refresh token lives
  in an HttpOnly cookie … It is never returned in a response body."* Widening
  that contract is a security decision for the owner, not a side effect of a
  theme task;
- it is outside Execution 07's stated scope ("do not redesign unrelated
  components").

The work was not thrown away: it is preserved verbatim at
`docs/audit/exec07/phase-e-continuation/reverted-staff-mobile-auth/` with its
test, which passed (7/7). If the owner wants an ERP mobile client, restore the
two files from that directory. The customer-plane equivalent on `HEAD` is
untouched.

## Was any work lost?

One class of file was **not** recovered, and it is not a loss: two
pre-approval photographs (`hero-showroom.jpg`, `showroom-jaguar.jpg`) exist only
in dangling stash commits. They were candidates from the photography phase that
the approved set replaced — the committed set is
`auto-service`, `carwash-premium`, `ev-charging`, `garage-brastad`,
`garage-interior`, `inspection-bay`, `mechanic-engine`, `parts-store`,
`recovery-tow`, `workshop-artdeco`. The dangling snapshots also carried helper
scripts (`verify-light-surface.mjs`, `stack-up.sh`) that already exist on
`HEAD`, so nothing unique was dropped.

There is no stash on `HEAD` and no dangling commit whose content is absent from
`HEAD` except those two superseded photographs.

## Conclusion

The crashed session's work was pushed. Recovery is complete and no completed
work was discarded. The light-theme task continues from `2e3e93e`.
