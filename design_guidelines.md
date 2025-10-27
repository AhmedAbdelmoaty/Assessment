# Bilingual Data Analysis Learning Platform - Design Guidelines

## Design Approach
**Reference-Based**: Inspired by Duolingo's friendly engagement + Linear's professional clarity + Khan Academy's learning-focused layouts. Clean, approachable educational interface that builds confidence through clear visual hierarchy and conversational interaction design.

**Core Principles**:
- Trust through professionalism: Refined UI instills credibility in educational content
- Reduce cognitive load: Clear information hierarchy supports learning
- Bilingual fluidity: Seamless RTL/LTR transitions feel native, not adapted
- Conversational warmth: Chat interface feels like helpful mentor, not robotic tool

---

## Color Palette

**Brand Foundation**:
- Primary: 0 72% 39% (Maroon #A52025)
- Primary Hover: 0 72% 32%
- Primary Light: 0 72% 95% (backgrounds/accents)

**Light Mode**:
- Background: 0 0% 98%
- Surface: 0 0% 100%
- Surface Elevated: 0 0% 100% with shadow
- Text Primary: 0 0% 13%
- Text Secondary: 0 0% 40%
- Border: 0 0% 88%
- Success: 142 71% 45%
- Warning: 38 92% 50%
- Error: 0 84% 60%

**Dark Mode**:
- Background: 0 3% 11%
- Surface: 0 2% 15%
- Surface Elevated: 0 2% 18%
- Text Primary: 0 0% 95%
- Text Secondary: 0 0% 65%
- Border: 0 0% 25%
- Primary adjusts to: 0 72% 55% (more vibrant)

---

## Typography

**Fonts**:
- English: Inter (Google Fonts) - 400, 500, 600, 700
- Arabic: Noto Sans Arabic (Google Fonts) - 400, 500, 600, 700
- Monospace (code): JetBrains Mono - 400, 500

**Hierarchy**:
- Hero: 48px/56px (mobile: 32px/40px) - Bold
- H1: 36px/44px (mobile: 28px/36px) - SemiBold
- H2: 28px/36px (mobile: 24px/32px) - SemiBold
- H3: 20px/28px - Medium
- Body: 16px/24px - Regular
- Small: 14px/20px - Regular
- Caption: 12px/16px - Medium

**RTL Considerations**: Apply `dir="rtl"` and `lang="ar"` to Arabic containers. Mirror directional properties (padding, margin, flexbox order) automatically through RTL-aware CSS.

---

## Layout System

**Spacing Units**: Consistently use 2, 4, 6, 8, 12, 16, 24, 32, 48 (Tailwind equivalents)

**Container Strategy**:
- Max-width: 1280px for main content
- Dashboard/Tool areas: 1440px
- Text content: 720px (prose width)
- Padding: 16px mobile, 24px tablet, 32px desktop

**Grid System**:
- Assessment cards: 1 column mobile, 2 tablet, 3 desktop
- Chat + sidebar: 2-column split (sidebar 320px fixed, chat fluid)
- Dashboard widgets: CSS Grid with gap-6

---

## Component Library

### Buttons (Pill-Shaped)
- Border radius: 9999px (fully rounded)
- Padding: 12px 24px (medium), 8px 16px (small), 16px 32px (large)
- Primary: Maroon background, white text
- Secondary: Transparent background, maroon border 2px, maroon text
- Ghost: Transparent, maroon text only
- Floating (Mobile): 48px height, 120px max-width, compact padding 10px 20px
- Floating (Desktop): 52px height, subtle shadow (0 4px 12px rgba(0,0,0,0.08))
- On-image buttons: Background blur-lg with bg-white/20 (light) or bg-black/30 (dark)

### Cards
- Border radius: 16px
- Shadow: 0 1px 3px rgba(0,0,0,0.08) default, 0 4px 16px rgba(0,0,0,0.12) elevated
- Padding: 20px mobile, 24px desktop
- Border: 1px solid border color
- Hover: Lift with shadow transition (0 8px 24px rgba(0,0,0,0.14))

### Chat Interface
- Message bubbles: 16px radius, max-width 75%
- User messages: Align right (LTR) / left (RTL), maroon background, white text
- AI messages: Align left (LTR) / right (RTL), surface background, primary text
- Typing indicator: 3 animated dots, 8px each, subtle bounce
- Input: 48px height, 24px radius, border subtle, focus ring maroon
- Avatar: 36px circle for AI, 32px for user
- Spacing: 12px between messages, 24px between conversation groups

### Navigation
- Top nav: 64px height, backdrop blur, sticky
- Logo + language toggle (EN/عربي) on opposite ends
- Pills for nav items: Hover shows light maroon background
- Mobile: Hamburger menu, slide-in drawer

### Forms & Inputs
- Input fields: 48px height, 12px radius, 2px border
- Focus state: Maroon border, subtle maroon ring
- Labels: 14px, medium weight, 8px margin bottom
- Error state: Error color border, small error text below

### Progress Indicators
- Assessment progress: Horizontal bar, 8px height, maroon fill, gray background, 999px radius
- Step indicators: Circles with numbers, 40px diameter, connected by 2px line
- Loading: Maroon spinner, 24px default size

### Data Visualization (Analysis Platform)
- Chart colors: Start with maroon, extend to analogous palette (warm reds/oranges)
- Bar charts: 8px radius on tops
- Grid lines: Subtle gray, 1px
- Tooltips: Card style, compact padding, arrows pointing to data

---

## Key Screens Layout

### Landing/Hero
- Full-width hero: 85vh desktop, 70vh mobile
- Two-column: Left text (headline + subhead + CTA pills), Right large hero illustration/screenshot
- Background: Subtle gradient from maroon/5% to transparent
- Headline emphasizes bilingual capability prominently

### Dashboard
- Left sidebar: 280px, navigation + user profile
- Main area: Grid of assessment cards + recent activity
- Stats cards: 3-column grid showing progress metrics
- Quick action floating button: Bottom right, maroon, white icon

### Assessment Interface
- Question card: Center focused, max-width 800px
- Progress bar: Top of screen, fixed
- Navigation pills: Bottom, Previous/Next, Submit
- Answer options: Large touch targets, 56px height minimum

### Chat Interface (Teaching Mode)
- Conversational flow: Messages stack naturally
- Code blocks: Dark theme with syntax highlighting, copy button
- Explanation cards: Expandable sections within chat
- Quick replies: Pill buttons below AI message, inline suggestions

---

## Images

**Hero Section Image**:
- Position: Right half of hero section (60% width desktop, full-width mobile stacked below text)
- Content: Modern illustration showing diverse students interacting with data visualizations and bilingual interfaces. Arabic and English text elements visible in the illustration. Warm, friendly color palette with maroon accents.
- Style: Clean, modern 3D illustration or high-quality photograph with subtle depth
- Treatment: Subtle shadow, optional: slight perspective tilt for depth

**Dashboard/Content Images**:
- Assessment thumbnails: Square, 180px, illustrative icons representing data analysis topics
- Profile images: 64px circles for instructors/users
- Empty states: Friendly illustrations, 240px height, centered

**General Image Guidelines**:
- All images should feel professional yet approachable
- Use illustrations that incorporate both Arabic and Latin scripts naturally
- Maroon should appear as accent color in images
- Maintain consistent illustration style throughout platform