# HustleBook

**Every Hustle. Every Home. Every Shilling.**

A mobile-first SaaS foundation for personal finances, households and business management.

## GitHub Pages deployment

This repository includes a GitHub Actions workflow at `.github/workflows/pages.yml`. It deploys the static site on every push to `main`.

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, choose **GitHub Actions** as the source.
3. Open the **Actions** tab and check the deployment workflow.
4. When it succeeds, open the site URL shown in the workflow or Settings → Pages.

The landing page is static today. Authentication and private app features must be wired to Supabase before they are usable.

## Supabase setup

The SQL foundation is in `supabase/schema.sql`.

1. Open the Supabase project SQL Editor.
2. Review `supabase/schema.sql` carefully.
3. Run it to create the isolated `hb_*` HustleBook tables and owner-based Row Level Security policies.
4. Keep your existing Garage Operations Pro tables unchanged.
5. Configure Supabase Auth redirect URLs for the final GitHub Pages site URL before enabling sign-up/login.

### Security rules

- Do not grant anonymous access to private financial tables.
- Every private table exposed through the Supabase Data API must have appropriate grants and Row Level Security policies.
- The publishable key can be used in browser code only with correctly configured RLS; it is not a substitute for RLS.
- Never expose a Supabase service-role/secret key or payment-provider secret in the browser or GitHub repository.
- Do not store full card numbers or CVVs.
- Payment success must be verified server-side using a payment provider's verified webhook/API before activating a paid subscription.
- The initial SQL policies restrict records to each owner. Household and team sharing needs additional membership-based policies before enabling shared workspaces.
- Subscription status and payment records should not be trusted if they are editable by the customer. Move those writes to a trusted backend/Edge Function when payment integration is implemented.

## Product roadmap

1. Mobile-first public website and design system.
2. Supabase authentication and onboarding.
3. Personal income/expense tracking, budgets, debts and savings goals.
4. Household and business workspaces with carefully tested access rules.
5. Customers, inventory, invoices and payment records.
6. Subscription billing via eligible providers for M-Pesa and international cards.
7. Testing, privacy policies, terms, support and production hardening.

## Important

GitHub Pages only hosts static frontend files; it does not run private server-side code or payment webhooks. Use Supabase Edge Functions or another trusted backend for privileged operations and payment verification.


## Workspace/business expansion

Run `supabase/migrations/20261023_workspace_business_modules.sql` in the Supabase SQL Editor after the base schema. It adds workspace scoping to budgets, debts, savings, customers, products and invoices, plus owner-protected Suppliers, Jobs & Services, and Bills & Reminders modules. The frontend exposes these modules and scopes their records to the selected finance area. Existing NULL-workspace records remain visible in Personal only.

Not yet operational: household invitations/shared access, public service-provider marketplace, invoice line-item PDF generation, scheduled email/push delivery, and verified live subscription/payment processing. These require additional membership/verification/server-side work and must be tested before being offered to customers.
