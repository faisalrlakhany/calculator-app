# Calculator App

A mobile calculator built with **React Native** and **Expo** (SDK 58).

## Features

- Basic arithmetic: addition, subtraction, multiplication, division
- Chained operations and `equals` (e.g. `2 + 3 × 2` computes left-to-right as `10`)
- Percent, sign toggle (`±`), decimal input, backspace, and all-clear
- Division-by-zero / invalid result handling
- Dark theme with safe-area and status bar handling for real devices

## Project structure

```
src/
  app/            # Expo Router routes (root layout + screens)
    _layout.tsx   # Stack navigator + status bar
    index.tsx     # Calculator screen (safe area aware)
  components/     # Reusable UI components
    Calculator.tsx
  hooks/          # Business logic
    useCalculator.ts
```

## Getting started

```sh
npx expo start        # start the dev server (Expo Go / development build)
npx expo start --android
npx expo start --ios
```

## Quality checks

```sh
npx tsc --noEmit     # TypeScript typecheck
npx expo lint        # ESLint
npx expo-doctor      # Expo dependency & config diagnostics
```

## Building

Use EAS for native builds / updates:

```sh
npx eas-cli build --profile development
npx eas-cli submit --profile preview
```
