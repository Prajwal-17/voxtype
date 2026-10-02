# Interface rollout

1. [x] Standardize the chosen palette in shared/theme.ts and generate platform values.
2. [x] Replace desktop trials with a fixed sidebar, concise screens and owned in-app recording.
3. [x] Extend API analytics with averages and provider usage estimates; retain account isolation.
4. [x] Page local transcripts on both platforms (12 rows per request).
5. [x] Build native mobile primitives, bottom tabs, explicit recorder and focused-field bubble rules.
6. [x] Generate proper brand, launcher and splash assets.
7. [ ] Complete runtime, lint, type, build and visual checks; update the existing PR.

Android device checks still needed: permission denial/revocation, keyboard dismissal,
switching fields/apps while recording, backgrounding, bubble dragging, and launcher/splash
rendering on a real launcher. Web preview verifies React Native layout, not OS overlays.
