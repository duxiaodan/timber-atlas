<img src="public/icon.svg" alt="木构图志 · Timber Atlas" width="80" height="80">

# 木构图志 · Timber Atlas

English | [简体中文](README.zh-CN.md)

[Open the interactive guide](https://timber-atlas.xiaodan.io/)

Explore Chinese timber architecture, one component at a time.

木构图志 · Timber Atlas is an interactive 3D guide to the East Hall of Foguang Temple in Shanxi, China. Look beneath the roof, follow how beams and bracket sets meet, and practise assembling the structure. Switch between Chinese and English as you explore; component notes connect what you see to documentary sources.

## Start exploring

Once the app is running, try these four steps:

1. **Reveal the frame.** Hide the roof tiles and roof boards in the structural layer list to see the timber beneath.
2. **Follow a connection.** Select a component to read its name, role and connections. Isolate the component or its assembly for a closer look.
3. **Take it apart.** Move the exploded-view slider to separate the parts, or use a section view to look inside.
4. **Put it together.** Open Guided Assembly and choose a local study to practise placing components.

Three appearances offer different ways to read the structure: **Present-day colors**, **Painted** and **Natural wood**. Painted decoration includes interpretive choices; see [model sources and limitations](docs/model-and-sources.md).

Drag to orbit, scroll to zoom and right-drag to pan. Learning progress is saved in your browser.

## Run locally

You need Node.js 24 and npm. Clone this repository, open its directory, then run:

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. The app renders 3D geometry on your device; a desktop browser with WebGL support and a mouse is recommended. Detailed models can take time to load and may be demanding on lower-powered devices.

To build and serve the static site, you also need Python 3:

```sh
npm run build
python3 -B scripts/serve.py --port 4173
```

Open `http://127.0.0.1:4173`. The generated site is in `dist/`. Browser storage belongs to the current hostname and port; changing either gives you a separate learning-progress store.

For optional online hosting, see [Cloudflare Pages and R2 deployment](deployment/cloudflare/README.md). Local development continues to use local model files and requires no Cloudflare account.

## About the model

The East Hall brings columns, beams, bracket sets and roof framing together in one building, making it a useful subject for learning how timber structures fit together.

This edition focuses on the building structure. Interior altars, statues and their screen walls are omitted; rooftop ornaments are included.

The model draws on published surveys, architectural research and photographs. Dimensions and repeated elements are regularized; concealed connections and some decorative details are inferred. It is an educational reconstruction, with component-level source notes. Read [model sources and limitations](docs/model-and-sources.md) for how to interpret it.

## Contribute

Corrections to architectural descriptions, translations, interaction design and source attribution are welcome. See the [contribution guide](CONTRIBUTING.md) for code entry points, checks and how to report an issue.

## Credits and use

Third-party software, photographs and font-derived assets have their own terms. See [credits and licenses](THIRD_PARTY_NOTICES.md). No general license has yet been granted for the project's original code and assets.

The [SVG logo and project name](docs/branding.md) are available for identifying the project in links and descriptions.
