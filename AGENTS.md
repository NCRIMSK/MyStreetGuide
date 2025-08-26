# Repository Guidelines

## Project Structure & Module Organization
- Source entry points: `index.js` (bootstraps app) and `App.tsx` (root component).
- Platforms: `android/`, `ios/` (native projects managed by React Native CLI).
- Tests: `__tests__/` (e.g., `__tests__/App.test.tsx`).
- Config: `.eslintrc.js`, `.prettierrc.js`, `jest.config.js`, `babel.config.js`, `metro.config.js`, `tsconfig.json`.
- Utilities/hooks live at the root (e.g., `useCalibratedMagnetometer.js`). Prefer TypeScript for new files.

## Build, Test, and Development Commands
- `npm start`: Launch Metro bundler for local development.
- `npm run android`: Build and install the app on Android emulator/device.
- `npm run ios`: Build and install the app on iOS simulator/device (macOS).
- `npm test`: Run Jest tests.
- `npm run lint`: Lint codebase with ESLint.
Examples: `npm test -- --watch`, `npm test -- --coverage`.

## Coding Style & Naming Conventions
- Linting: Extends `@react-native` ESLint config; fix issues before pushing.
- Formatting: Prettier enforced. Key rules: `singleQuote: true`, `trailingComma: 'all'`, `bracketSpacing: false`, `bracketSameLine: true`, `arrowParens: 'avoid'`. Indentation: 2 spaces (Prettier default).
- File types: Use `.tsx` for React components, `.ts` for utilities; existing JS is supported.
- Naming: Components in `PascalCase` (e.g., `MapScreen.tsx`), hooks prefixed `use` (e.g., `useHeading.ts`), tests as `*.test.tsx?` under `__tests__/`.

## Testing Guidelines
- Framework: Jest with `preset: 'react-native'`.
- Location/patterns: Place tests in `__tests__/` (e.g., `Feature.test.tsx`).
- Coverage: No enforced threshold; aim for meaningful coverage. Use `npm test -- --coverage` locally.
- Prefer component tests with `react-test-renderer` and pure-function unit tests.

## Commit & Pull Request Guidelines
- Commits: Small, focused, imperative subject (e.g., "feat: add compass calibration helper").
- Prefer Conventional Commits (`feat|fix|chore|docs|refactor|test`), reference issues when applicable.
- PRs: Clear description, linked issues, test plan, and screenshots/video for UI changes. Ensure `npm test` and `npm run lint` pass.

## Security & Configuration Tips
- Node: `>=18` (see `package.json` engines).
- Secrets (e.g., Azure Cognitive Services): never hardcode. Use platform keystores or runtime config; exclude from VCS.
- Do not commit generated or platform-specific build artifacts.
