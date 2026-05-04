# Evia CRM - Pipedrive-Style Visual Revamp (Definitive Brief)

## Read This First

This brief replaces all previous direction guidance. It is the single source of truth from this point forward.

We're not restructuring the CRM. We're not removing features. We're not consolidating pages. The functionality of the existing app is correct. What's wrong is purely the visual language and a few navigation patterns that need to mirror Pipedrive.

This brief is exhaustive on purpose. Read all of it before writing any code. If anything contradicts the codebase, default to the codebase and flag the conflict.

## What the Goal Looks Like

Open Pipedrive in your head: a clean, slightly playful but always professional CRM. Light backgrounds, confident colour use, clear stage-based navigation, generous spacing, bold action buttons, badges that pop. You can scan a screen and immediately know what to do next.

The Evia CRM should feel like Pipedrive's cousin - same DNA, same usability, but wearing Evia Consultancy's iris-purple-and-navy clothing instead of Pipedrive's green-and-orange.

References to internalise:
- Pipedrive list view (deals with stage tabs at the top)
- Pipedrive contacts list (clean rows, gentle hover, status-coloured chips)
- Pipedrive sidebar with iconography
- Pipedrive primary buttons (slightly elevated, confident, never flat)
- Pipedrive empty/loading/error states (warm and reassuring, not cold)

What we are explicitly NOT building:
- Stripe Dashboard (cold, dense, monochrome)
- Generic shadcn/ui dashboard
- Material Design app
- Salesforce Lightning
- Anything that feels enterprise or clinical

## What's Already Built (Stays)

Keep all of this work, retune it where the brief below specifies:

- All design tokens already in `client/src/index.css`
- DataTable, Badge, Button components in `client/src/components/`
- Format utilities in `client/src/lib/format.ts` (formatDate, formatCurrency, formatRelativeDays, getStatusLabel)
- Fonts: Inter + JetBrains Mono via Google Fonts in `index.html`
- Branch: `feat/ui-revamp-v1`
- Plain CSS (no Tailwind), Radix primitives, Lucide icons
- All existing entity types in `client/src/lib/types.ts`
- All existing pages, routes, and data fetching patterns
- The hand-rolled ToastProvider, ConfirmDialog, NotesPanel
- Auth flow and ProtectedRoute wrapper

## Existing Page Structure (Preserve)

The current top-level navigation is:
1. Active Tenders (`/`)
2. Client Book (`/clients`)
3. Sales Pipeline (`/pipeline`)
4. Contracts Prospected (`/prospected`)
5. Results Tracker (`/results`)

Do not change these routes, do not consolidate pages, do not remove pages. We're restyling, not restructuring.

The only navigation change is moving from the current horizontal top tabs to a Pipedrive-style left sidebar. More on that below.

## Final Brand Identity

The CRM is for **Evia Consultancy** (rebrand from Evia Marketing).

Logo: `client/src/assets/evia-logo.png` - place this in the top-left of the sidebar.

Brand palette (these values are final, do not change):
- Iris purple primary: `#8176B2`
- Iris purple deep (text/links/hover): `#6B619B`
- Iris purple deepest (active/pressed): `#574D82`
- Iris purple subtle (backgrounds): `#F2F0F8`
- Iris purple border: `#D9D4E8`
- Brand navy (deep emphasis): `#0E2130`
- Cool grey (secondary brand): `#969DA7`

WCAG rule that must be followed everywhere:
- `#8176B2` is BACKGROUND only (with white text on top) or LARGE text 18px+
- For body text, links, button text on white: use `#6B619B`
- Active nav: `#F2F0F8` background with `#574D82` text

## Visual Language Specifications

### Page Background

```css
--surface-page: #F7F5FA;           /* warm iris-tinted neutral */
--surface-card: #FFFFFF;
--surface-muted: #EFEDF4;          /* hover, secondary surfaces */
--surface-sunken: #E8E4F0;
--surface-warm: #FAF8FB;
```

The page should never feel stark. The faint iris wash on `--surface-page` is what makes it warm without being purple. Pipedrive does the same trick with a subtle warm grey.

### Borders

```css
--border-subtle: #E5E7EB;
--border-default: #D1D5DB;
--border-strong: #9CA3AF;
```

### Typography

Inter for everything except:
- JetBrains Mono on: tender values, fees, dates, ref codes, percentages, mono-style numbers in KPI tiles where the whole value is numeric

Type scale:
```css
--text-xs: 11px;      /* meta labels, table column headers */
--text-sm: 13px;      /* table body, button text */
--text-base: 14px;    /* form inputs, primary UI */
--text-md: 15px;
--text-lg: 18px;
--text-xl: 22px;
--text-2xl: 26px;     /* page titles */
--text-3xl: 32px;     /* KPI values */
```

Page titles should be 26px / weight 700 / letter-spacing -0.02em. Section headings 18px / weight 600. Table headers 11px / weight 600 / uppercase / letter-spacing 0.06em.

## Sidebar Navigation (Major Change)

This is the biggest structural change. Replace the current horizontal top nav with a Pipedrive-style left sidebar.

### Layout

- Width: 220px
- Position: fixed left, full viewport height
- Background: `#FFFFFF`
- Right border: 1px solid `--border-subtle`
- Z-index: 40 (sits above page content)

The main content area shifts right by 220px to accommodate.

### Sidebar Structure (top to bottom)

**Section 1: Brand (top)**
- Padding: 20px
- Logo image (`evia-logo.png`), max-height 32px, width auto
- Below the logo, in 11px weight 600 letter-spacing 0.04em text-tertiary uppercase: "CRM"

**Section 2: Main nav (below brand, separated by a 1px border-subtle divider)**
- Padding: 16px 12px
- Nav items as a vertical stack, 4px gap

Each nav item:
- Padding: 10px 12px
- Border radius: 6px
- Font: 14px weight 500
- Display: flex, align-items center, gap 12px
- Icon: Lucide, 18px, stroke-width 1.75
- Text colour at rest: `--text-secondary`
- Icon colour at rest: `--text-tertiary`
- Hover: background `--surface-muted`, text `--text-primary`, icon `--text-secondary`
- Active state: background `#F2F0F8`, text `#574D82`, icon `#574D82`, weight 600
- Active state has a 3px iris-purple bar on the left edge of the item: `box-shadow: inset 3px 0 0 var(--brand-primary)`

Nav items in order:
1. Active Tenders → Lucide `FileText` → `/`
2. Sales Pipeline → Lucide `TrendingUp` → `/pipeline`
3. Client Book → Lucide `Building2` → `/clients`
4. Contracts Prospected → Lucide `Search` → `/prospected`
5. Results Tracker → Lucide `Trophy` → `/results`

**Section 3: User (bottom of sidebar, pushed down with margin-top auto)**
- Padding: 16px
- 1px border-top `--border-subtle`
- Display flex, align centre, gap 10px
- Avatar circle 32px (initials, brand-subtle bg, brand-active text, weight 700)
- Name + role stacked: name 13px weight 600 text-primary, "Logout" link 12px text-tertiary hover text-secondary
- Or use a small dropdown chevron that opens a menu with Logout

### Mobile sidebar

At <768px viewport, sidebar collapses to a hamburger button at the top-left of the page. Tapping it slides the sidebar in from the left over the content with a backdrop. Backdrop click or Escape closes it.

## Top Bar (Above Page Content)

A thin horizontal bar above each page's content, sitting to the right of the sidebar.

- Height: 56px
- Background: `#FFFFFF`
- Border-bottom: 1px solid `--border-subtle`
- Padding: 0 24px
- Display flex, align centre, justify space-between

Left side: page title or breadcrumb. For now, just the page title in 16px weight 600 text-primary. Example: "Active Tenders".

Right side: global actions
- Search icon button (Lucide Search) - opens a global search modal in the future, just a placeholder for now
- Notification bell icon button (Lucide Bell) - placeholder, no functionality yet
- Both icons: 18px, ghost button styling, 36px square hit area

The top bar provides context and gives the app weight. Without it, pages feel orphaned.

## Page Layout Pattern (All Pages)

Every page follows this vertical structure:

```
[Top Bar - 56px]
[Page Header - title, description, primary action]
[KPI Tiles - if applicable]
[Tab/Filter Bar - if applicable]
[Main Content - usually a table]
```

Page content uses padding: 24px on all sides. Max-width: none (let it fill the space right of the sidebar).

### Page Header

- Margin-bottom: 24px
- Display flex, justify space-between, align flex-start

Left side:
- Title: 26px weight 700 letter-spacing -0.02em text-primary, no margin
- Description below title: 14px text-secondary, margin-top 6px

Right side:
- Primary action button (e.g., "+ Add Tender") - bold, with shadow, iris purple

### KPI Tiles

Render at the top of pages where high-level numbers help context. 4-6 tiles in a row.

Layout:
- Grid: `repeat(auto-fit, minmax(200px, 1fr))`
- Gap: 16px
- Margin-bottom: 24px

Each tile:
- Background: `#FFFFFF`
- Border: 1px solid `--border-subtle`
- Border radius: 8px
- Padding: 18px 20px
- Display flex, align-items flex-start, gap 14px

Icon container (left of content):
- 40px square
- Border radius: 8px
- Display flex, centre
- Coloured background based on tile semantic (see below)

Icon: Lucide, 20px, stroke-width 2, white or coloured

Tile content (right):
- Label: 11px weight 600 uppercase letter-spacing 0.04em text-tertiary, margin 0 0 6px
- Value: 28px weight 700 letter-spacing -0.02em text-primary, line-height 1.1
- Optional sub-text below value: 12px text-tertiary

Icon background colours by semantic type:
- Brand: `#F2F0F8` bg, `#574D82` icon
- Success: `#DCFCE7` bg, `#15803D` icon
- Warning: `#FEF3C7` bg, `#92400E` icon
- Danger: `#FEE2E2` bg, `#B91C1C` icon
- Info: `#DBEAFE` bg, `#1E40AF` icon

Hover: subtle box-shadow `0 2px 8px rgba(28, 25, 23, 0.06)`, transition 150ms.

Page-by-page KPI tile mapping (apply these exactly):

**Active Tenders:**
- Active Tenders count → FileText, brand
- Submitted count → Send, info
- Pipeline Value → TrendingUp, brand (mono value)
- Submitted Value → Briefcase, brand (mono value)

**Sales Pipeline:**
- Active Prospects → Users, brand
- Contacted → MessageCircle, neutral
- Call Booked → Calendar, info
- Summary Sent → FileSignature, brand
- Agreed → CheckCircle2, success
- Overdue → AlertCircle, danger (red if count > 0)

**Client Book:**
- Total Clients → Building2, brand
- Active Clients → Activity, success
- Total Won Value → Trophy, success (mono)
- Total Won Fees → Banknote, success (mono)

**Results Tracker:**
- Total Won → Trophy, success
- Total Lost → XCircle, danger
- Win Rate → Target, brand
- Total Fees Earned → Banknote, success (mono)

**Contracts Prospected:**
Use existing data shape - audit and propose KPIs that match the page's purpose, fall back to count + value totals.

## Stage Tabs (Active Tenders + Sales Pipeline)

This is the second major navigation change. Replace the current "Live Pipeline / Results" tabs and the "All Live / All" filter dropdowns with a Pipedrive-style stage tab bar that shows each stage as its own visible tab with a count.

### Visual

Container:
- Background: `#FFFFFF`
- Border: 1px solid `--border-subtle`
- Border radius: 8px 8px 0 0
- Margin-bottom: 0 (sits flush against the table below)
- Padding: 0
- Display flex, no gap, overflow-x auto for narrow screens

Each tab:
- Padding: 14px 20px
- Border-bottom: 3px solid transparent
- Cursor pointer
- Display flex, align centre, gap 10px
- Font: 14px weight 500 text-secondary
- Transition: all 150ms

Tab states:
- Hover: text-primary, border-bottom `--border-default`
- Active: text `#574D82`, weight 600, border-bottom `--brand-primary`
- Tab count badge: small pill next to label, 11px weight 600, padding 2px 8px, radius 10px, background `--surface-muted` text-tertiary at rest, background `#F2F0F8` text `#574D82` when tab is active

### Active Tenders stage tabs

Map the existing tender statuses to these stage tabs:
1. **All** - shows everything except `archived`
2. **Writing** - status = `writing`
3. **PSQ** - status = `questionnaire_sent` (display "PSQ Stage" in badges, but tab label is just "PSQ")
4. **Submitted** - status = `submitted` (display "Submitted / Awaiting Result" in detail views, "Submitted" everywhere else)
5. **Won** - status = `won`
6. **Lost** - status = `lost`

Default tab on page load: Writing.

Each tab shows the count of tenders in that stage as a small pill next to the label.

### Sales Pipeline stage tabs

Map prospect statuses to these stage tabs:
1. **All** 
2. **Contacted**
3. **Call Booked**
4. **Summary Sent**
5. **Agreed**

Default tab: Contacted.

Same visual styling. Same count pills.

### Other pages (no stage tabs)

- Client Book: no stage tabs needed (use a simple search + filter row instead)
- Contracts Prospected: depends on existing data, use stage tabs if there are clear stages, otherwise simple filters
- Results Tracker: stage tabs for Won / Lost / All

## Search and Filter Row

Below the stage tabs (or directly below the page header on pages without stage tabs):

Container:
- Background: `#FFFFFF`
- Border: 1px solid `--border-subtle`
- Border-top: none (sits flush under stage tabs when present)
- Border radius: 0 0 0 0 (no rounding when below tabs); `8px 8px 0 0` (when standalone)
- Padding: 14px 16px
- Display flex, gap 12px, align centre

Search input:
- Flex: 1, max-width 400px
- Height: 36px
- 1px border `--border-default`, radius 6px
- Leading icon: Lucide Search 16px, text-tertiary, 12px from left edge
- Padding: 8px 12px 8px 36px (extra left for icon)
- Placeholder: "Search tenders, clients, refs..."
- Focus: border-primary, 3px outline `rgba(129, 118, 178, 0.15)` (iris glow)

Filter dropdowns:
- Same height/border as search input
- Width: 160px each
- Lucide ChevronDown 14px in trailing position
- Display: "All Assigned", "All Sectors", etc.

Clear filters ghost button:
- Only renders when at least one filter is set
- Small ghost button, 12px text, text-tertiary, hover text-primary

## DataTable (Already Built, Retune)

The DataTable component is already built. Apply these refinements:

### Container

- Border radius: 0 0 8px 8px (when below stage tabs + filter row, only bottom corners round)
- Border: 1px solid `--border-subtle`
- Border-top: none if directly below stage tabs / filters, else full border
- Background: `#FFFFFF`

### Row height

Bump to 56px default, 68px for 2-line cells. Pipedrive rows are spacious - this is the breathing room you noticed missing.

```css
.dt-tr { min-height: 56px; }
.dt-tr--two-line { min-height: 68px; }
.dt-td { padding: 16px 12px; }
```

### Row hover

```css
.dt-tr:hover {
  background: #F7F5FA;     /* same as page bg, gentle */
}
```

### Selected row

```css
.dt-tr--selected {
  background: #F2F0F8;
  box-shadow: inset 3px 0 0 var(--brand-primary);
}
```

### First / last cell padding

First cell padding-left: 24px (was 20px - more breathing room).
Last cell padding-right: 24px.

### Header

- Height: 44px (was 36px)
- Background: `#FAFAF9` (very subtle warm tint, not pure white)
- Font: 11px weight 600 uppercase letter-spacing 0.06em text-tertiary
- Border-bottom: 1px solid `--border-subtle`

## Status Badges (Already Built, Retune)

The badge palette pivot landed in the previous commit but needs further amplification for Pipedrive-level confidence.

### Sizing

```css
.badge {
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;        /* slightly softer than 4px */
  letter-spacing: 0.01em;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
```

### Optional dot indicator

Pipedrive often uses a coloured dot before badge text. Add this as a variant:

```css
.badge--with-dot::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
```

This makes status badges feel more like stage chips. Apply it to status badges in tables. Don't apply to outcome badges (Won/Lost) - those are pure result indicators.

### Colours (saturated, confident)

```css
--badge-success-bg: #DCFCE7;
--badge-success-text: #15803D;
--badge-success-dot: #22C55E;

--badge-warning-bg: #FEF3C7;
--badge-warning-text: #92400E;
--badge-warning-dot: #F59E0B;

--badge-danger-bg: #FEE2E2;
--badge-danger-text: #B91C1C;
--badge-danger-dot: #EF4444;

--badge-info-bg: #DBEAFE;
--badge-info-text: #1E40AF;
--badge-info-dot: #3B82F6;

--badge-brand-bg: #E9E4F5;
--badge-brand-text: #574D82;
--badge-brand-dot: #8176B2;

--badge-neutral-bg: #E5E7EB;
--badge-neutral-text: #374151;
--badge-neutral-dot: #6B7280;
```

### Status to badge variant mapping

Tenders:
- Writing → warning (amber chip with dot)
- PSQ Stage → neutral (grey chip with dot)
- Submitted → info (blue chip with dot)
- Won → success (green chip, no dot, since it's a result)
- Lost → danger (red chip, no dot)
- Archived → neutral with strikethrough or muted styling

Prospects:
- Contacted → neutral
- Call Booked → info
- Summary Sent → brand
- Agreed → success

## Buttons (Already Built, Retune)

### Primary

```css
.btn-primary {
  background: var(--brand-primary);
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 600;
  padding: 9px 16px;
  border-radius: 6px;
  border: none;
  box-shadow: 0 1px 2px rgba(87, 77, 130, 0.18), 0 1px 0 rgba(255, 255, 255, 0.12) inset;
  cursor: pointer;
  transition: all 150ms ease;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.btn-primary:hover {
  background: var(--brand-hover);
  box-shadow: 0 2px 6px rgba(87, 77, 130, 0.25), 0 1px 0 rgba(255, 255, 255, 0.12) inset;
  transform: translateY(-1px);
}

.btn-primary:active {
  background: var(--brand-active);
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(87, 77, 130, 0.15);
}
```

The inset highlight + shadow + 1px lift on hover is the Pipedrive trick that makes buttons feel tactile. Apply to all primary buttons including "+ Add Tender", "Mark Won", "Send Summary", "Book Call".

### Secondary

```css
.btn-secondary {
  background: #FFFFFF;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-secondary:hover {
  background: var(--surface-muted);
  border-color: var(--border-strong);
}
```

### Ghost (used in table actions)

```css
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-ghost:hover {
  background: var(--surface-muted);
  border-color: var(--brand-primary);
  color: var(--brand-active);
}
```

The brand-coloured border on hover is what tells the user "you can click me".

### Danger

```css
.btn-danger {
  background: #B91C1C;
  color: #FFFFFF;
  /* same shape as primary, danger colour */
}
```

Used only for destructive confirmations (delete, drop prospect, etc).

## KPI Tile Component (Build in Step 3)

Already specced above under "Page Layout Pattern → KPI Tiles". Build it in Step 3 alongside PageHeader.

## PageHeader Component (Build in Step 3)

Already specced above. Simple component with title, description, optional actions slot.

## Modals (Already Built, Restyle)

Apply the new visual language to existing modals:

```css
.modal-overlay {
  background: rgba(28, 25, 23, 0.5);
  backdrop-filter: blur(2px);    /* subtle Pipedrive touch */
}

.modal {
  background: #FFFFFF;
  border-radius: 10px;
  box-shadow: 0 20px 50px rgba(28, 25, 23, 0.15), 0 8px 16px rgba(28, 25, 23, 0.08);
}

.modal-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.modal-body {
  padding: 20px 24px;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background: #FAFAF9;
  border-radius: 0 0 10px 10px;
}
```

The slightly off-white footer is a Pipedrive pattern - it gives the action area visual weight.

## Form Inputs (Restyle)

```css
.input,
.select,
.textarea {
  background: #FFFFFF;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 9px 12px;
  font-size: 14px;
  color: var(--text-primary);
  transition: all 150ms ease;
}

.input:hover,
.select:hover {
  border-color: var(--border-strong);
}

.input:focus,
.select:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px rgba(129, 118, 178, 0.15);
}

.input--error {
  border-color: #DC2626;
}

.input--error:focus {
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.15);
}
```

The 3px iris glow on focus is the Pipedrive way of saying "this field is active".

Form labels:
- 13px weight 500 text-primary
- Margin-bottom: 6px

Form helper text:
- 12px text-tertiary
- Margin-top: 4px

Form error text:
- 12px weight 500 colour `#DC2626`
- Margin-top: 4px

## Toast Notifications (Restyle)

Existing ToastProvider stays. Restyle:

```css
.toast {
  background: #FFFFFF;
  border-left: 4px solid var(--toast-accent-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(28, 25, 23, 0.12);
  padding: 14px 16px;
  min-width: 320px;
  max-width: 420px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.toast--success { --toast-accent-color: #22C55E; }
.toast--error { --toast-accent-color: #EF4444; }
.toast--info { --toast-accent-color: #3B82F6; }
.toast--warning { --toast-accent-color: #F59E0B; }
```

Toast positioning: bottom-right, 24px from edges, 12px gap between stacked toasts.

## Loading States

Skeleton rows in DataTable:
- Background: linear-gradient shimmer using `--surface-muted` and `--surface-warm`
- Animation: 1.5s ease-in-out infinite

```css
@keyframes skeleton-pulse {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--surface-muted) 0%,
    var(--surface-warm) 50%,
    var(--surface-muted) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  border-radius: 4px;
}
```

KPI tile loading:
- Show the icon and label, replace value with skeleton bar (80px wide, 28px tall, 4px radius)

Page-level loading (rare):
- Show the page header and KPI skeletons, then the table skeleton
- Never show a blank page during initial load

## Empty States

Make them warm, not clinical.

DataTable empty:
- Centred container, 280px tall
- Lucide icon at top (chosen by context: e.g., FileX for tenders, UserX for prospects), 36px stroke-width 1.5, colour text-tertiary
- Margin: 16px below icon
- Heading: 16px weight 600 text-primary
- Sub-text: 13px text-secondary, max-width 320px, line-height 1.5
- Optional primary action button below, margin-top 20px

Example for Active Tenders empty:
- Icon: FileX
- Heading: "No tenders match these filters"
- Sub-text: "Try adjusting the stage tab or search, or add a new tender to get started."
- Action: "Clear filters" (secondary) or "+ Add tender" (primary)

For genuinely empty pages (new account):
- Icon, heading, sub-text, primary action
- Examples:
  - Active Tenders: "Your first tender awaits" + "Add tender"
  - Sales Pipeline: "Track your first prospect" + "Add prospect"

## Error States

DataTable error:
- Same layout as empty state
- Lucide AlertCircle 36px, danger colour
- Heading: "Couldn't load [page]"
- Sub-text: error message in 13px text-secondary
- Action: "Try again" secondary button

## Animations

Pipedrive uses subtle motion, not flashy animation. Keep these timings:

```css
--transition-fast: 100ms ease-out;       /* hover */
--transition-base: 150ms ease-out;       /* most state changes */
--transition-modal: 200ms ease-out;      /* modal open */
--transition-slide: 250ms cubic-bezier(0.16, 1, 0.3, 1);  /* slide-overs */
```

Use `cubic-bezier(0.16, 1, 0.3, 1)` (a snappy ease-out-quint) for slide-over panels and large-element transitions. It's the Pipedrive spring feel.

Honour `prefers-reduced-motion: reduce` globally - already set up, verify.

## Page-by-Page Specifications

For each page below, use the exact patterns above. The data and columns largely match what's already built - I'm specifying any column or behaviour adjustments.

### Active Tenders (`/`)

Page header:
- Title: "Active Tenders"
- Description: "Track tenders through writing, submission, and outcomes"
- Action: "+ Add Tender" primary button

KPI tiles: as specced above (4 tiles).

Stage tabs: All / Writing / PSQ / Submitted / Won / Lost

Filter row: search + Assigned dropdown + Clear filters

Table columns:

| Column | Width | Render |
|---|---|---|
| Tender | flex, max 360px, truncate | 2-line: title (weight 500) + ref code (mono 11px text-tertiary) |
| Status | 160px | Badge with dot |
| Client | 180px, truncate | single line |
| Value | 120px, mono, right | formatCurrency or "-" |
| Fee | 100px, mono, right | formatCurrency or "-" |
| Submission | 110px, mono, right | formatDate |
| Award | 130px, mono, right | formatDate + countdown/overdue chip below if applicable |
| Assigned | 100px | 28px avatar + name |
| Actions | 200px, right-align | "Notes" ghost + (action varies by status) primary + "Edit" ghost |

Action button per status:
- Writing: ghost only (Notes + Edit)
- PSQ: ghost only
- Submitted: primary "Mark Won" (and a separate ghost "Mark Lost" hidden in row hover or kebab menu)
- Won/Lost: ghost only

Row click: expands to show activity timeline + notes preview + quick actions (existing expand panel, restyled).

### Sales Pipeline (`/pipeline`)

Page header:
- Title: "Sales Pipeline"
- Description: "Move prospects from contact to agreement"
- Action: "+ Add Prospect" primary

KPI tiles: 6 tiles as specced.

Stage tabs: All / Contacted / Call Booked / Summary Sent / Agreed

Filter row: search + Assigned + "Show overdue only" toggle

Table columns:

| Column | Width | Render |
|---|---|---|
| Company | 200px, truncate | 2-line: company + contact name (text-tertiary 11px) |
| Tender | flex, max 320px, truncate | 2-line: tender title + buyer (text-tertiary 11px) |
| Status | 150px | Badge with dot |
| Last Contact | 110px, mono, right | formatDate |
| Next Follow-up | 140px, mono, right | formatDate + overdue chip if past |
| Assigned | 100px | avatar + name |
| Actions | 220px, right-align | Status-driven primary + Notes + Edit + Drop |

Action per status:
- Contacted → primary "Book Call"
- Call Booked → primary "Send Summary"
- Summary Sent → primary "Mark Agreed"
- Agreed → primary "Convert to Client"

### Client Book (`/clients`)

Page header:
- Title: "Client Book"
- Description: "Your active and historical clients"
- Action: "+ Add Client" primary

KPI tiles: 4 tiles as specced.

No stage tabs. Filter row only: search + Sector dropdown + Status (Active/Inactive/All).

Table columns:

| Column | Width | Render |
|---|---|---|
| Client | 220px | 2-line: company name + primary contact |
| Sector | 140px | text |
| Active Bids | 100px, mono, right | count |
| Won Bids | 100px, mono, right | count |
| Won Value | 130px, mono, right | formatCurrency |
| Won Fees | 110px, mono, right | formatCurrency |
| Last Activity | 120px, mono, right | formatDate |
| Actions | 120px | "View" + "Edit" ghosts |

Row click: opens client detail SlidePanel (wide variant).

### Contracts Prospected (`/prospected`)

Audit existing data shape first, but apply the same page pattern: header, KPIs, filter row, table.

Action: "+ Add Contract"

If existing fields suggest stage progression, add stage tabs. If not, simple filters.

### Results Tracker (`/results`)

Page header:
- Title: "Results Tracker"
- Description: "Won and lost tender outcomes"
- Action: none (read-only mostly, or "Export Results" if useful)

KPI tiles: 4 tiles (Won, Lost, Win Rate, Fees Earned).

Stage tabs: All / Won / Lost

Filter row: search + Assigned + Year dropdown

Table columns:

| Column | Width | Render |
|---|---|---|
| Tender | flex, max 360px, truncate | 2-line: title + ref |
| Outcome | 100px | Badge (Won success, Lost danger, no dot - results not stages) |
| Client | 180px | |
| Value | 130px, mono, right | |
| Fee | 110px, mono, right | |
| Result Date | 120px, mono, right | |
| Assigned | 100px | avatar + name |
| Actions | 100px | "Notes" + "Edit" ghosts |

Row click: expands to show outcome notes, lessons learned, etc.

## Implementation Order

Step 3 was paused. Resume from Step 3 with this brief as the current source of truth.

**Step 3: Sidebar + Top Bar + KPI Tiles + PageHeader + supporting components**
- Build new Sidebar component (220px fixed left, full height)
- Build new TopBar component (56px above page content)
- Update Layout.tsx to use sidebar + top bar instead of horizontal top nav
- Build KPITile component
- Build PageHeader component
- Build StageTabs component
- Build FilterBar component (or restyle existing)
- Restyle Input, Select, Textarea
- Restyle Modal
- Restyle Toast
- Restyle ConfirmDialog
- Update playground to demonstrate Sidebar + TopBar + KPI row + StageTabs + FilterBar + DataTable end-to-end
- Commit: "feat(ui): pipedrive-style chrome - sidebar, top bar, kpi tiles, stage tabs"
- **CHECKPOINT 3**: screenshot the playground showing the full layout. Wait for approval.

**Step 4: Active Tenders page**
- Wire the new Layout (Sidebar + TopBar) into the actual app
- Refactor Active Tenders to use new components: PageHeader, KPI tiles, StageTabs (with the 6 stage tabs), FilterBar, DataTable
- Map existing tender statuses to stage tabs
- Restyle row expand panel
- Migrate inline activity log out of row display, into row expand
- Verify all existing data fetching, mutations, and routes preserved
- Commit: "feat(ui): refactor Active Tenders to pipedrive layout"
- **CHECKPOINT 4**: screenshot the live Active Tenders page. Wait for approval.

**Step 5: Sales Pipeline page**
- Same pattern, with the 5 stage tabs (All / Contacted / Call Booked / Summary Sent / Agreed)
- Status-driven primary action button per row
- Commit: "feat(ui): refactor Sales Pipeline to pipedrive layout"

**Step 6: Client Book page**
- New layout, no stage tabs
- Implement client detail SlidePanel (wide variant)
- Commit: "feat(ui): refactor Client Book to pipedrive layout"

**Step 7: Contracts Prospected page**
- New layout, audit existing data first
- Commit: "feat(ui): refactor Contracts Prospected to pipedrive layout"

**Step 8: Results Tracker page**
- New layout, stage tabs (All / Won / Lost)
- Commit: "feat(ui): refactor Results Tracker to pipedrive layout"

**Step 9: NotesPanel restyle + final pass**
- Restyle NotesPanel SlidePanel to match new modal/slide-over visual language
- Audit all pages side by side, fix inconsistencies
- Run accessibility check (axe DevTools or Lighthouse)
- Verify mobile baseline behaviour
- Commit: "feat(ui): notes panel restyle + consistency pass"

**Step 10: Cleanup**
- Remove unused old CSS, old component files
- Update README with new screenshots if applicable
- Open draft PR with summary + screenshots of every page
- **CHECKPOINT 5**: review PR, merge to main when approved

## Anti-Patterns - Do Not Do These

### Visual
- Do NOT make it look like Stripe Dashboard (cold, dense, no colour) - that was the previous wrong direction
- Do NOT use the old vivid `#8A2BE2` purple anywhere - we're on iris purple `#8176B2` now
- Do NOT use full-pill (border-radius 999px) badges - 6px radius
- Do NOT use raw Tailwind grays (`text-gray-500`) - use the token system
- Do NOT use gradients except the iris gradient on the top nav strip (deferred / removed if too heavy)
- Do NOT use shadcn/ui components - build directly with Radix primitives + plain CSS
- Do NOT introduce new icon libraries - Lucide only
- Do NOT introduce new font libraries - Inter + JetBrains Mono only
- Do NOT use placeholder-only labels on form fields
- Do NOT use em dashes (-) anywhere - hyphens (-) only
- Do NOT use emoji icons - Lucide everywhere

### Copy
- Do NOT write AI-sounding microcopy: "Awesome!", "Let's get started!", "Great choice!" - direct, factual language
- Do NOT use exclamation marks in any UI label
- Do NOT capitalise every word in headings - sentence case for descriptions, Title Case for page titles and column headers only

### Code
- Do NOT change API contracts, mutation logic, or routing structure unless a UI change explicitly requires it
- Do NOT remove existing functionality you don't fully understand - flag and ask
- Do NOT introduce new state management libraries
- Do NOT introduce new form libraries
- Do NOT inline styles (`style={{ ... }}`) unless absolutely necessary
- Do NOT skip writing tokens - every colour must reference a token

## Acceptance Criteria

The revamp is done when all of these are true:

- Sidebar navigation replaces horizontal top tabs across the app
- Logo visible in sidebar top-left, links to home
- TopBar above page content, 56px, with title + global actions placeholder
- Every list page has KPI tiles at the top
- Active Tenders, Sales Pipeline, and Results Tracker have stage tabs (writing/PSQ/submitted/won/lost on Active Tenders, contacted/call booked/etc on Pipeline, won/lost on Results)
- Filter row with search + filter dropdowns sits below stage tabs (or under page header on no-tab pages)
- DataTable has 56px row height, gentle hover, generous padding
- Status badges are bold, saturated, with optional dot indicator
- Primary buttons have shadow + lift on hover, iris purple
- Page background is warm iris-tinted neutral, not stark white
- Inter is the body font everywhere, JetBrains Mono on numerical data
- All existing pages, routes, and data fetching preserved
- Lighthouse accessibility 95+ on every page
- No em dashes, no AI microcopy, no emoji icons anywhere
- Branch pushed and PR opened with screenshots

## If You Get Stuck

If at any step you encounter:
- Codebase patterns that contradict the brief
- A library/dependency decision not covered above
- An existing feature you don't want to break that this brief might affect
- Data shape ambiguity

Stop. Summarise the issue. Propose 2-3 options. Wait for input. Do not guess.

## Final Note

This is the third iteration of direction guidance for this revamp. Do not deviate, do not improve in passing, do not anticipate v2. Ship this version cleanly. Subsequent passes will refine page by page based on the live result.

If anything is unclear, ask before starting Step 3. Once Step 3 begins, the assumption is the brief is fully understood.
