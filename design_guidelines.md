# IMP Assessment Platform - Design Guidelines

## Design Approach: Material Design (Clean Interpretation)
Selected for its strong patterns in conversational interfaces, card-based layouts, and professional aesthetic perfect for educational platforms. Emphasizing clarity, trust, and guided user flows.

## Core Design Elements

### A. Color Palette

**Brand Colors (from existing styles.css):**
- Primary Maroon: 340 65% 35% (preserve existing brand identity)
- Secondary Maroon: 340 50% 45% (lighter variant for hover states)

**Supporting Colors:**
- Background Light: 0 0% 98%
- Background Dark: 220 15% 12%
- Surface Light: 0 0% 100%
- Surface Dark: 220 12% 16%
- Text Primary Light: 220 15% 20%
- Text Primary Dark: 0 0% 95%
- Text Secondary Light: 220 10% 50%
- Text Secondary Dark: 0 0% 70%
- Success: 150 60% 45%
- Warning: 45 95% 55%
- Error: 0 70% 50%
- Border Light: 220 15% 90%
- Border Dark: 220 10% 25%

### B. Typography

**Font Stack:**
- Primary: 'Inter' via Google Fonts CDN (clean, readable for UI and chat)
- Monospace: 'JetBrains Mono' (for OTP inputs, code snippets)

**Type Scale:**
- Display: 36px / 600 weight (dashboard headers)
- Heading 1: 28px / 600 weight (section titles)
- Heading 2: 20px / 600 weight (card headers)
- Body Large: 16px / 400 weight (chat messages, primary content)
- Body: 14px / 400 weight (secondary text, labels)
- Caption: 12px / 400 weight (timestamps, metadata)

### C. Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16, 24
- Micro spacing (form fields, icons): p-2, gap-2
- Component spacing: p-4, p-6, gap-4
- Section spacing: p-8, p-12, py-16
- Page margins: px-4 (mobile), px-8 (tablet), px-12 (desktop)

**Container Strategy:**
- Max-width: max-w-7xl for dashboard
- Chat interface: max-w-3xl mx-auto (centered, focused)
- Authentication cards: max-w-md mx-auto

### D. Component Library

**Chat Interface Components:**
- Message Bubbles: Rounded-2xl, user messages align right with maroon background, system messages left with surface background, p-4 spacing, 16px body text
- Input Bar: Fixed bottom, elevated shadow, rounded-full input field with send button integrated, 56px height
- Typing Indicator: Three animated dots in surface color
- Authentication Inline Cards: Embedded in chat flow, rounded-xl, p-6, white/surface background with subtle border

**Dashboard Components:**
- Navigation: Top bar with logo left, user menu right, 64px height, sticky positioned
- Section Cards: Grid layout (2 columns desktop, 1 column mobile), rounded-xl, p-6, hover elevation effect
- Assessment Cards: Display thumbnail, title, date, score badge, status indicator (completed/in-progress)
- Progress Bars: Rounded-full, 8px height, maroon fill with light background
- Stats Display: Large numbers (24px/600) with caption labels below

**Authentication Components:**
- OTP Input: 6 boxes, monospace font, 48px square each, gap-2, centered layout
- Password Field: Toggle visibility icon, strength indicator below
- Submit Buttons: Maroon primary, rounded-lg, px-8 py-3, full-width mobile

**Navigation & Actions:**
- Primary Buttons: Maroon background, white text, rounded-lg, px-6 py-3
- Secondary Buttons: Outline maroon, maroon text, rounded-lg
- Icon Buttons: 40px square, rounded-full, hover background
- Tab Navigation: Underline active state (maroon, 2px), subtle hover states

### E. Images

**Hero Section: NO traditional hero image**
Instead: Clean gradient header (340 65% 35% to 340 50% 25%) with white text overlay, 40vh height, centered content with platform tagline and "Start Assessment" CTA.

**Dashboard Images:**
- Assessment thumbnails: 16:9 aspect ratio, rounded-lg, 200px width on cards
- Tutorial/Video cards: Preview images with play overlay icon, 4:3 aspect ratio
- Empty states: Illustrated icons (from Material Icons library) with explanatory text

**Icon Library:**
Material Icons via CDN for: navigation, form controls, status indicators, dashboard sections

### Key Layout Patterns

**Chat Flow (Mobile-First):**
Single column, full viewport height, messages stack vertically with 8px gaps, input bar fixed at bottom with safe area padding

**Dashboard (Responsive Grid):**
- Header: Full-width sticky top
- Sections Grid: grid-cols-1 md:grid-cols-2 gap-6
- Each section card: Minimum 280px height, expandable on click
- "My Info" card: Display name, email, language preference, edit button
- "Past Assessments": List view with infinite scroll, latest 10 shown initially
- "Tutorials/Videos": Thumbnail grid, 2 columns mobile, 3 desktop

**Authentication Integration:**
Seamlessly embedded in chat thread as system messages with interactive cards, no page redirects, smooth transitions between OTP → password → login states

### Accessibility

- High contrast ratios (4.5:1 minimum for text)
- Focus indicators: 2px maroon outline with 2px offset
- RTL support for Arabic: Automatic mirroring of layouts, right-aligned text
- Keyboard navigation: All interactive elements accessible via tab
- Screen reader labels on all icon buttons and form inputs