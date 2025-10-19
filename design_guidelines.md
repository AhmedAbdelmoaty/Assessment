# Design Guidelines: Bilingual Data Analysis Assessment Platform

## Design Approach: Material Design System
**Rationale**: Educational platform requiring information density, strong form patterns, excellent RTL/LTR support, and professional aesthetic. Material Design provides robust components for dashboards, data visualization, and assessment interfaces.

## Core Design Elements

### A. Color Palette

**Light Mode:**
- Primary: 210 100% 45% (Professional blue - trust and learning)
- Primary Hover: 210 100% 38%
- Secondary: 155 65% 45% (Success/progress green)
- Background: 0 0% 100%
- Surface: 210 20% 98%
- Surface Elevated: 0 0% 100%
- Text Primary: 215 25% 15%
- Text Secondary: 215 15% 45%
- Border: 215 20% 88%
- Error: 0 85% 55%

**Dark Mode:**
- Primary: 210 100% 60%
- Primary Hover: 210 100% 68%
- Secondary: 155 55% 55%
- Background: 215 25% 10%
- Surface: 215 20% 14%
- Surface Elevated: 215 20% 18%
- Text Primary: 210 15% 95%
- Text Secondary: 210 10% 70%
- Border: 215 15% 24%
- Error: 0 75% 65%

### B. Typography

**English (LTR):**
- Font Family: Inter via Google Fonts
- Headings: 600-700 weight
- Body: 400-500 weight
- Display (H1): text-4xl (36px) leading-tight
- Section (H2): text-2xl (24px) leading-snug
- Card Title (H3): text-xl (20px) leading-normal
- Body: text-base (16px) leading-relaxed
- Small: text-sm (14px) leading-normal

**Arabic (RTL):**
- Font Family: Noto Sans Arabic via Google Fonts
- Maintain same size scale but adjust weights: 500-600 for headings, 400 for body

### C. Layout System
**Spacing Units**: Use Tailwind units of 2, 4, 6, 8, 12, 16, 20 (e.g., p-4, m-8, gap-6)
- Container: max-w-7xl mx-auto px-6
- Card Padding: p-6 to p-8
- Section Spacing: py-12 to py-16
- Grid Gaps: gap-4 to gap-6
- Component Spacing: space-y-4 to space-y-6

### D. Component Library

**Authentication:**
- Centered card layout (max-w-md) with subtle shadow
- Input fields with labels above, border-b-2 focus state
- Primary button full-width at bottom
- Language toggle (EN/AR) in top-right corner

**Dashboard Layout:**
- Sticky top navigation (h-16) with logo, user menu, language switcher
- Sidebar navigation (w-64) with icons and labels for: Dashboard, Assessments, Reports, Teaching Mode, Profile
- Main content area with breadcrumbs and page title
- Responsive: sidebar collapses to mobile drawer

**Profile Card:**
- Avatar circle (w-20 h-20) with initials fallback
- Name and email stacked below
- Stats grid: Total Assessments, Average Score, Learning Streak
- Each stat: number (text-3xl font-bold) + label (text-sm text-secondary)

**Assessment History:**
- Table or card grid showing: Date, Topic, Score, Status badge
- Status badges: rounded-full px-3 py-1 with bg-opacity-20
- Completed (green), In Progress (blue), Not Started (gray)
- "View Report" link/button per row

**MCQ Interface:**
- Progress bar at top showing question N of M (h-2 rounded-full)
- Question card: large text with p-8
- Answer options: border-2 rounded-lg p-4 hover state, selected state with primary border
- Navigation: Previous/Next buttons, Skip option
- Timer display (if timed) in top-right

**Report View:**
- Score visualization: circular progress (using CSS conic-gradient or similar)
- Performance breakdown: horizontal bar charts per topic
- Strengths/Weaknesses sections with bullet lists
- Personalized recommendations in highlighted cards

**Teaching Mode:**
- Split layout: Concept explanation (60%) | Practice problem (40%)
- Explanation with rich text, bullet points, examples
- Interactive practice area with immediate feedback
- "Next Concept" progression button

**Conversational Intake:**
- Chat-like interface with message bubbles
- User messages: aligned-end, primary bg
- System messages: aligned-start, surface bg
- Input field sticky at bottom with send button
- Typing indicator animation

### E. Animations
- Page transitions: fade-in (150ms)
- Card hover: slight lift (translate-y-1) with shadow change
- Button interactions: scale-95 on active
- Loading states: spinner or skeleton screens
- No unnecessary scroll-triggered animations

## RTL/LTR Considerations
- Use `dir="rtl"` attribute for Arabic
- Mirror layouts: text-align, flex-direction, padding/margin
- Icons remain un-mirrored (e.g., arrows point logically)
- Ensure consistent spacing regardless of direction
- Test all interactive states in both directions

## Images Section
**No Large Hero Image**: This is a utility platform focused on dashboard functionality, not marketing.

**Profile/Avatar Images:**
- User profile pictures (circular, fallback to colored initials)
- Empty state illustrations for no assessments (simple, flat style SVG illustrations)

**Teaching Mode Visuals:**
- Diagram illustrations for data analysis concepts (charts, graphs, statistical visuals)
- These should be educational, not decorative

**Implementation**: Use placeholder services or icon libraries for initial build; real images added during content phase.