# Contributing to 木构图志 · Timber Atlas

English | [简体中文](CONTRIBUTING.zh-CN.md)

Useful contributions include clearer component explanations, Chinese–English terminology, architectural sources, accessible controls and reproducible bug reports.

## Report a problem or suggest a correction

Open an [issue](https://github.com/duxiaodan/timber-atlas/issues) with the steps to reproduce the problem, what you expected and what happened. Include your browser, interface language and a screenshot when useful. For a model issue, include the component ID shown in Field Notes, the viewing direction and the relevant appearance or section settings.

For architectural corrections, link the source and identify the page, figure or photograph. Explain whether it concerns this building or a comparison with another building or period. This helps distinguish direct evidence from interpretation.

## Work on the code

Follow the [README setup](README.md), then create a branch for your change. Keep each pull request focused on one problem and explain the resulting behavior. Include screenshots for visible changes and describe how you checked them.

Useful entry points:

| Area | Files |
|---|---|
| Interface and layout | `src/main.ts`, `src/style.css` |
| 3D rendering and selection | `src/viewer.ts` |
| Learning progress and saved state | `src/state.ts` |
| Building geometry and component descriptions | `src/model/` |
| Architectural source records | `src/model/sources.ts` |
| Language support | `src/i18n/`, `docs/i18n/` |
| Regression tests | `tests/` |

Run these checks before submitting:

```sh
npm test
npm run typecheck
npm run build
```

Check visible wording in both Chinese and English. For geometry changes, show the affected connection from more than one direction and check neighboring components. `npm run build` packages the geometry in the repository; `model:*` commands regenerate geometry and can modify asset files.

## Sources and permissions

Include attribution and usage terms for any new asset. Link reference photographs and publications when discussing a shape or structure; permission to view a reference does not establish permission to redistribute it. The project's original code and assets currently have no general license; the [third-party notices](THIRD_PARTY_NOTICES.md) describe separately licensed materials.
