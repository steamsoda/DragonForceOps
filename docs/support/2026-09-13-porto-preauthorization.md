# Porto Test Account Preauthorization

- Owner approved `tigres.azulyoro@live.com` for the same operational read-only role as Rita, with no financial access, before first sign-in. No account/password is created by this migration, and it does not mark an identity confirmed or send email.
- v1.17.68 adds a private email authorization table. Rita's existing manual-only eligibility is preserved; only the test address has an automatic first-confirmed-login grant. Microsoft/Supabase must supply the confirmed identity.
- The database authorization check remains authoritative for manual grants and operational data. Removed duplicate hardcoded Rita-only checks from the application so authorized test identities can enter the same portal.
- Automatic grant consumes a one-time approval and records the approving owner in the audit trail. It never modifies existing staff roles. Revoking the resulting role does not regrant it on later logins; disabling the email also prevents the operational RPC from returning data.
- Pre-deployment rollback rehearsal passed 27 checks: confirmation gating, exact-email grant, no duplicate grants, no role combination, private-table denial, eight operational projections, raw financial/personal data and write denial, disabling, revocation and unrelated-account denial. Every fixture and grant was rolled back.
- Support test: `scripts/test-porto-preauthorization.cjs`; `--preview` selects the guarded Preview project, `--verify-live` validates the installed migration instead of replaying it. No test should replace an existing target identity.
- Release verification will be recorded after Preview and production deployment. Actual external Microsoft tenant/personal-account compatibility still requires the user's own sign-in.
