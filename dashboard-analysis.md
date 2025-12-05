# Dashboard Reference Analysis

This document captures the structure and UI patterns from the provided React dashboard snippet so we can adapt the layout to the existing vanilla JS/HTML stack without pulling in React or Recharts.

## High-level layout
- **Fixed sidebar** on the left with vertical navigation buttons for sections: Overview, My Info, My Assessments, My Tutorials, My Videos. Active item uses a gradient background; inactive states use muted text with hover highlighting.
- **Main content area** offset by sidebar width. Each section animates in with a light fade/slide effect.
- **Card styling**: rounded corners, subtle borders, drop shadows, gradient accents for status badges or primary actions.

## Section breakdown
- **Overview**
  - Welcome header with user first name and a streak badge.
  - Stats cards: total points, completion rate, total assessments, total tutorials.
  - Charts: area chart for performance trend and radar chart for skill levels. These rely on Recharts, so for our stack we can approximate with simple SVG or lightweight chart libs if allowed, or use CSS-based bars.

- **My Info**
  - Profile hero card with initials avatar, name, level, join date.
  - Editable form fields for name and email (toggle edit mode). For our app, we will replace the toggle with immediate save-on-change (per requirements) and extend fields to the full profile schema: full_name, email, phone, country, age_band, job_nature, experience, job_title, sector, learning_reason.
  - Learning stats row showing completed assessments count, average score, streak.

- **My Assessments**
  - "Average Assessment Score" hero card with gradient background.
  - Grid of assessment cards showing topic badge, score with color coding, animated progress bar, and completion date.
  - Sorting/filtering controls (to be added in our implementation) for newest/oldest/highest/lowest.

- **My Tutorials**
  - Grid of tutorial preview cards (title, preview text, date) with click-to-open detailed conversation.
  - Detailed view shows full transcript with chat-style bubbles, colored by role.
  - Back button to return to list.

- **My Videos**
  - Placeholder hero block with call-to-action plus three muted placeholder cards.

## Interaction patterns to reuse
- **Active section state** toggled by sidebar buttons.
- **Animated progress bars** via CSS width transition and gradient fill.
- **Modal or panel for tutorial transcript** with scrollable content.
- **Consistent gradients** for primary actions and badges; neutral background gradients across the page.

## Adaptation notes for this repo
- The project uses vanilla JS and serves static assets from `/public`; we should rebuild this UI using plain HTML/CSS/JS (no React) and the existing design tokens (reds, typography, header styles) to preserve branding.
- Data must come from real APIs: `/api/profile` for profile load/save, `/api/assessments` for completed assessments (with proper scoring rule), `/api/tutorials` for archived tutorials, and the session reset endpoint for "New Assessment". Avoid dummy data once wired.
- Ensure single-language UI per user selection (no mixed Arabic/English labels), clickable tabs/buttons, and lazy loading per section where appropriate.
- Progress bars should animate on first render; keep accessibility in mind with clear labels and contrast.

This analysis serves as a blueprint for translating the React-based reference dashboard into the project's vanilla front-end while honoring brand colors and real data wiring.
