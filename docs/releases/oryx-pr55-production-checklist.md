# ORYX PR #55 — production release checklist (NOT YET DEPLOYED)

## Release gates (all mandatory)

1. GitHub Actions **Typecheck and build**, **Unit and API integration tests**, and **Browser acceptance tests** must all be green on the exact merged commit.
2. Confirm Arabic/English sales invoice, payment receipt and payment voucher print previews match the approved ORYX AUTO SERVICES masthead, watermark, shared Arial PDF font and identical print icon placement. Check long/multipage documents, title language, and watermark legibility.
3. Test POS in both light and dark themes: barcode and camera scan, images, cart, stock adjustment, selecting a warehouse, receipt generation and cash/card payments.
4. Check fixed BHD discount and VAT: quantity x price excludes VAT, discount is a fixed monetary amount, VAT is applied to the net line, unit price remains unchanged and invoice/ledger/receipt agree. Retest a legacy percentage-discount invoice.
5. Test creation with **no manually provided code** for products/SKUs, suppliers, warehouses, lead source/lead/pipeline/opportunity, accounts, HR departments/job titles/employees/leave/shift/worksites/payroll periods, inspection services, bays, providers, projects, companies, branches and roles. Also test concurrent creation and tenant boundaries.
6. Preserve existing document numbering (sales/credit notes/receipts/stock and payments) separately from master codes. Verify the automatically allocated references on newly created records.
7. Confirm Prisma migrations are additive and all production data is backed up. Do **not** run `prisma migrate dev`, `db:reset` or `db:seed` in production.

## Release commands (only after CI and visual sign-off)

Run on the ORYX host with the production PM2 environment already configured and a verified database backup. The backup below intentionally requires a `DATABASE_URL` supplied securely by the operator; do not echo credentials or store them in the repository.

```bash
set -euo pipefail
cd /var/www/oryx-latest

# Check for local modifications before updating the checked-out release.
git status --short
# Stop and investigate if tracked application files were modified locally.
git fetch origin
git checkout release/oryx-latest
git pull --ff-only origin release/oryx-latest

# DATABASE_URL must be loaded securely in this shell before this point.
: "${DATABASE_URL:?Set production DATABASE_URL securely to back up before migration}"
mkdir -p /var/backups/oryx
BACKUP="/var/backups/oryx/oryx-before-pr55-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --file="$BACKUP" "$DATABASE_URL"
pg_restore --list "$BACKUP" >/dev/null
printf 'Verified DB backup: %s\n' "$BACKUP"

pnpm --filter @oryx/database migrate:status
pnpm --filter @oryx/database migrate:deploy
pnpm --filter @oryx/database generate
pnpm --filter @oryx/shared build
pnpm --filter @oryx/database build
pnpm --filter @oryx/api build
pnpm --filter @oryx/admin build

pm2 restart oryx-api oryx-admin --update-env
pm2 status oryx-api oryx-admin
curl --fail --silent --show-error -L -o /dev/null https://admin.oryxbhr.com/login
```

## Verification after deployment

- Verify the current logged-in company and warehouse; run a disposable, reversible transaction scenario using the permitted staging/demo tenant, **not** a real customer sale.
- Confirm the database has applied the additive discount migration and the `OryxMasterCodeSequence` migration.
- Check fresh documents for auto numbering, logo, Arabic/English titles, watermark and discount/VAT arithmetic.
- Check PM2 API/admin errors and HTTP health.
- If the application fails, stop. Revert only the application release after analyzing schema compatibility; never blindly reverse an applied production migration. Restore the verified backup only through a supervised recovery decision.

**Status:** staging checklist only, NOT proof of passing CI, visual QA, or actual deployment.
