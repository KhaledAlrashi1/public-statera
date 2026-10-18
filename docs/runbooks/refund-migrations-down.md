# Refund migrations 0008 / 0009 — down runbook

MOB-R116 F3 (the R115 E1 text). Drizzle has no down migrations; this is the manual reversal of:

```sql
-- 0008_lame_mesmero
ALTER TABLE `transactions` ADD CONSTRAINT `chk_transactions_amount_nonzero` CHECK (`transactions`.`amount_kd` <> 0);
-- 0009_dazzling_blue_blade
ALTER TABLE `transactions` DROP CONSTRAINT `chk_transactions_amount_positive`;
```

0008 adds the new check before 0009 drops the old one, so the table is never unchecked. Drizzle records 0008's
row before 0009's DDL starts: if 0009 fails mid-deploy, 0008 stays recorded and a re-run applies only 0009.

RM-21: take the backup first (`sudo systemctl start statera-backup.service`, then the unit journal and the
Healthchecks.io `statera-db-backup` check), as for the deploy.

## Steps

1. Roll the code back to a sha before refunds (`workflow_dispatch sha=<sha>`). Code from before refunds works
   against either constraint: it never writes a negative amount.
2. Count refund rows:
   ```sql
   SELECT COUNT(*) FROM transactions WHERE amount_kd < 0;
   ```
   It must return 0. If it does not, **STOP**: reverting would mean changing or deleting user rows (RM-21), and
   re-adding the positive check with a negative row present fails with `ERROR 3819`.
3. Re-add the positive check:
   ```sql
   ALTER TABLE `transactions` ADD CONSTRAINT `chk_transactions_amount_positive` CHECK (`transactions`.`amount_kd` > 0);
   ```
4. Drop the non-zero check:
   ```sql
   ALTER TABLE `transactions` DROP CONSTRAINT `chk_transactions_amount_nonzero`;
   ```
5. Delete the two `__drizzle_migrations` rows whose `created_at` equals the `when` values of 0008 and 0009 in
   `apps/api/src/db/migrations/meta/_journal.json` (`1792318611756` and `1792318616438`). The migrator compares
   only against the newest `created_at`, so leaving them would skip 0008/0009 on a later forward deploy.

Run each step through the same `docker exec … mysql` pattern as the backups runbook, with `hostname; pwd` first.
