# Sivayaan CRM

CRM for Sivayaan Technologies' healthcare sales. ASP.NET Core 10 API (EF Core + SQLite) and a React + Vite UI.
Seeded on first run from `Healthcare_Market_Intelligence_Executive_Report_v1.xlsx` (859 businesses, scores, top-5 recommendations each).

## Run
    cd api && dotnet run          # http://localhost:5100 (creates crm.db and seeds it)
    cd web && npm install && npm run dev   # http://localhost:5173 (proxies /api to the API)

## Multiple products
Leads and deals each belong to a **product**. Seeded products: HMS, Lorrywowner.com, COPs, ABPS, Geethvaweaves
(edit or add more on the Products page). The sidebar product switcher filters the dashboard, leads, accounts,
contacts and pipeline; choose "All products" for a combined view. One customer account can hold leads/deals for several products.
The healthcare market-intelligence data (HMS) is optional per account and only shows where it exists.

## Importing leads
**Import leads** (sidebar): choose a product, upload an `.xlsx` or `.csv`, check the auto-matched columns, click *Check file* for a dry run, then import.
Rows reuse an existing customer when the phone (last 10 digits), email, or name + city matches, and are skipped if that customer already has an open lead or deal for the product.
Rows with no name or an invalid email are rejected and listed. Up to 5,000 rows per import; `.xls` files must be saved as `.xlsx` first.

## Features
- **Dashboard**: key numbers (revenue and orders this month, customers, new leads, lead conversion rate, follow-ups due today); leads table with **+ Add Lead**; charts (leads and conversion by platform, monthly revenue, top-selling products); bulk-deal pipeline board; customer list; today's follow-ups.
- **Leads**: one per customer per product; filter, edit, convert to a deal. "Source" is the platform (WhatsApp, Instagram, IndiaMART, ...).
- **Pipeline**: drag-and-drop board (Prospecting to Won/Lost). Deals carry a *segment* (e.g. Clinic / Pharmacy / Lab for HMS, set per product on the Products page) and *units*; 2+ units is a bulk deal.
- **Orders and customers**: record orders on an account; accounts with orders are customers. **Active** = last order within 30 days, **At Risk** = 31-75 days, **Lost** = 76+ days. Revenue and top-selling come from orders (top-selling groups by item name, else product).
- **Today's follow-ups**: leads due today or overdue, with a *Message on WhatsApp* button (opens wa.me with a ready message; 10-digit numbers get +91). *Done* logs the follow-up and schedules the next in 3 days.
- **Field visits (Google Maps)**: every lead, follow-up, account and the account page has **Map** (opens the pin) and **Directions** (starts navigation; opens the Maps app on a phone). HMS coordinates come from the workbook's Visit Planner sheet. If an account has no coordinates the links search by name + area. Edit an account to paste a Google Maps URL or `lat, lng`, or import `Latitude` / `Longitude` columns.
- **Route planner** (`/route`): plots every open lead that has coordinates on one OpenStreetMap map and plans field routes that **always start from Location 0** (the office, shown as pin 0; set in the `Office` section of `api/appsettings.json` — currently Plus Code `G866+FF4`, Phase 2, New Shankar Nagar, Ramachandrapuram). Facilities are grouped into days of N stops (default 15, nearest to Location 0 first); each day is ordered from Location 0 (nearest-neighbour + 2-opt, computed in the browser) and has *Open route in Google Maps* links (Google allows 10 stops per link, so bigger days become consecutive parts). Narrow by area, facility type, priority, "not visited yet", or "within X km of Location 0". *Record visit* opens the visit form (see below); *Skip* leaves a facility out of the route. Distances shown are straight-line estimates. Only map tiles are fetched from OpenStreetMap; no coordinates are sent to a routing service.
- **Recording field visits** (route planner and account page → *Record visit*): choose what happened — Interested, Requested a demo, Asked for pricing, Requested a follow-up, Requested more details, Requested clarification, Decision maker not available, Facility closed, Already using other software, Not interested, Other — and add notes, the person met (saved as a contact) and the next follow-up date. The lead's status moves forward (New > Contacted > Qualified; "Not interested" closes it and removes it from follow-ups), its next action and follow-up date are set, and the visit appears on the account's activity with its outcome. Facilities visited today stay on the route page under *Visited today*. Outcomes are defined in `Stages.VisitOutcomes` (`api/Models/Entities.cs`).
- **Digital reach** (`/reach`): open leads you can contact without visiting, in two tabs. **WhatsApp** lists leads with a mobile number (10 digits starting 6-9; landlines can't use WhatsApp) with a *Message on WhatsApp* button that opens a ready-made chat. **Email** lists leads with an email address (on the account or a contact) with a *Send email* button that opens a pre-filled message in your mail app. *Mark sent* logs the contact and schedules the next follow-up in 3 days. Leads with neither are counted so you know they need a visit or call. Emails come from account/contact records, the spreadsheet import, or the *Their email* field on the visit form.
- **Accounts / Contacts / Import leads / Products** as described above.

## Deploying (web and API on separate domains)
- **API**: publish with `dotnet publish api -c Release`. Allowed browser origins are `Cors:AllowedOrigins` in `appsettings.json` (currently `https://crm.sivayaantechnologies.com`); override with environment variables `Cors__AllowedOrigins__0`, `Cors__AllowedOrigins__1`, ... Use the exact origin: scheme + host, no path, no trailing slash. `localhost:5173` is always allowed for development. The SQLite file defaults to `crm.db` next to the app; set `ConnectionStrings__Crm` to put it somewhere persistent.
- **Web**: `npm run build` in `web` reads `web/.env.production` (`VITE_API_URL=https://crmapi.sivayaantechnologies.com`) and bakes the API address into the bundle; deploy the `dist` folder. Change that file if the API moves.
- A "blocked by CORS policy" error in the browser console means the API does not list the site's exact origin (or the API itself is down / returning an error, in which case the CORS header is also missing).

## Notes
- Seed data lives in `api/Data/seed.json` (extracted from the workbook). Delete `api/crm.db` to reseed.
- Workbook follow-up dates were stale, so seeded follow-ups are staggered from the first-run date by priority.
- "Today" and month boundaries use IST (UTC+5:30); change `Rules.UtcOffsetMinutes` in `CrmControllers.cs` for another timezone.
- Leads imported or seeded on first run count as "new leads" for 30 days.
- No authentication yet; add before exposing beyond localhost.
