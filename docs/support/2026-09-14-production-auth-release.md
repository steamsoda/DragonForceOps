# Production Auth Release 1.17.69

Owner approved controlled production deployment, with no further agents.
Isolated main-based source incorporates the tested Preview normal Director
read-only screens, financial/write denial, and email/password authentication.
Existing Microsoft authentication and staff privileges are preserved.

Provider preparation: owner saved production-only Resend SMTP credentials and
confirmation/recovery templates. Production hCaptcha and leaked-password
protection were independently read back as enabled. Exact production confirmation
and reset redirects were saved; Microsoft callbacks retained. Owner confirmed
the production hostname in hCaptcha. End-to-end email delivery remains to test.

Database preflight: 887 checks, rolled back, 81 staff/Porto comparisons.
Only migrations 20260914120000 and 20260914160000 are approved for installation.
No real account receives a new role during deployment. Rita remains untouched.

Recovery: Supabase intentionally shares magiclink/recovery token storage. No
strict token-purpose separation is claimed. Hosted Preview verified invalid,
expired and reused rejection, password update and refresh-session revocation.
The synthetic identity and local session files were removed.

Release is not complete until deployment and installed production validation
are recorded below. Avoid blanket workspace sync or unreviewed migrations.

## Production Release Progress

- Isolated checkout: `.tmp/production-release-20260914`, branch
  `codex/production-auth-readonly-20260914`, based on `origin/main` d761394.
- TypeScript, four read-only boundary suites, password-auth tests and diff check
  passed. Cloud production build also passed, version 1.17.69.
- Owner confirmed both production and Preview CAPTCHA hostnames.
- Eight reviewed non-secret production flags saved without downloading secrets.
- Fresh rollback rehearsal passed 887 checks. Guarded installation reran those
  checks and committed only migrations 20260914120000 and 20260914160000;
  history hashes read back correctly, no real user grants or fixture leakage.
- Pre-install schema backup SHA256:
  `ecef52c35834bf7c51c22422f5dba67ee0a7d61e8eb233b0d2b1e28ac1e34561`.
- Staged deployment `dpl_5ZzvTZwwx6N5CfkC2XRGSVEXd5Eu` promoted successfully
  using official Vercel CLI 59.16.0 after the older CLI reported a team mismatch.
- Canonical live browser shows 1.17.69 and preserved Superadmin access;
  separate public browser shows email/password login and rendered hCaptcha.
- Production Auth rejects missing/invalid CAPTCHA, requires email confirmation,
  and preserves Azure. Actual email delivery remains a manual end-to-end check.
- Synthetic production setup passed no-role denial and authorized read-only
  access using the same JWT. Full HTTP/revocation/recovery checks follow.
- First HTTP sweep exposed an archived tournament absent from the current signup
  board. Fixed the read adapter to retain catalog access and label membership
  unavailable rather than raising a 500 or reporting a false zero. Query errors
  and permission denial remain fail-closed; focused regression and TypeScript pass.
- Corrected deployment `dpl_CAaYoGMu3dZ7RLzVQUfh6wMhwg2c` is Ready on the
  canonical domain. The previously failing detail now returns 200 without an
  error digest. A CLI connection reset occurred after deployment completion;
  independent canonical deployment inspection verified the successful release.

## Installed Validation

- All 22 operational pages and 15 available detail pages passed HTML and RSC
  checks. Grouped-roster payload, raw/financial denial, absent-row update denial,
  and six mutation-request checks passed before the coverage assertion.
- The full HTTP command exits nonzero at its strict coverage threshold: production
  has zero rows in legacy `teams` and `weekly_callups`, independently confirmed
  with aggregate-only SQL. Thus legacy team and saved-callup detail paths are not
  covered in production. Current roster squads number 102 and are a separate model.
  Do not report the full HTTP command as passing or fabricate academy data.
- Same-session role revocation passed. Synthetic recovery initially rejected a
  75-character generated password: provider maximum is 72. Aligned new-password
  forms/schema/tests to 8-72 characters; sign-in compatibility remains unchanged.
- Fresh synthetic recovery with a valid password passed: stored password changed,
  all fixture refresh sessions removed, old refresh rejected, no live auth cookie.
  Unexpired access JWTs may remain valid until expiry; role removal is independently
  enforced. Both disposable accounts and local session files were cleaned up.
- Real Gmail signup/confirmation/reset delivery and browser sign-in remain pending
  owner confirmation. No email to Rita and no real-user role grant were performed.
