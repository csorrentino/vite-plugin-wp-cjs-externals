# vite-plugin-wp-cjs-externals

A small add-on for WordPress themes built with Vite and `@roots/vite-plugin` (for example, Sage 11).

## What problem does it solve?

WordPress already loads its own copy of its editor tools on every block editor screen, along with its own copy of React. Your theme's editor code should **use those copies**, not pack its own duplicates into your build.

`@roots/vite-plugin` does this for the code you write. But some packages you install, such as `@10up/block-components`, are written in an older style that it doesn't look at. Without this plugin, those packages can:

- **break the block editor completely.** It loads with an error, and every custom block shows "Your site doesn't include support for this block."
- **load a second copy of React**, which makes interactive controls in your blocks crash.
- **depend on WordPress scripts your theme never asks to load**, so things work in one place and mysteriously fail in another.

## What it does

1. **Connects older-style packages to WordPress's own scripts**, using the same rules WordPress and `@roots/vite-plugin` use. Pieces WordPress doesn't provide on its own, such as the icon set, are still included in your build.
2. **Makes sure everything uses WordPress's copy of React**, including your theme's own files.
3. **Adds what those packages need to `editor.deps.json`**, the list your theme uses to tell WordPress which scripts to load. Nothing goes missing.

You don't need to change any of your block code.

## Installing

This package lives on GitHub rather than the public npm registry. Install a specific version by downloading its release:

```bash
npm install --save-dev https://github.com/csorrentino/vite-plugin-wp-cjs-externals/archive/refs/tags/v1.0.0.tar.gz
```

Using the release download (rather than `github:csorrentino/…`) means installing doesn't need a GitHub SSH key or even git, and npm records a checksum so the version can't change underneath you.


## Using it

Add it to your theme's `vite.config.js`, next to `wordpressPlugin()`:

```js
import { defineConfig } from 'vite';
import { wordpressPlugin } from '@roots/vite-plugin';
import wordpressCjsExternals from 'vite-plugin-wp-cjs-externals';

export default defineConfig({
  plugins: [
    wordpressCjsExternals(),
    wordpressPlugin(),
    // …your other plugins
  ],
});
```

That's all. Build as usual with `npm run build`.

## Options

You usually won't need any of these.

```js
wordpressCjsExternals({
  // Always include these packages in your build, even if WordPress has its own copy.
  bundle: ['@wordpress/some-package'],

  // Which files to look at. By default, only installed packages (node_modules).
  include: /\/node_modules\//,

  // The name of the script list made by wordpressPlugin(). Only change this if you renamed it.
  depsFile: 'editor.deps.json',
});
```

## Checking it worked

After a build:

- Open `public/build/assets/editor.deps-*.json`. It should list the WordPress scripts your editor code uses (names starting with `wp-`, plus `react`).
- Open a page in the block editor. Your custom blocks should load without the "doesn't include support" message, and the browser console should be free of errors.

## Updating

Make your changes, update the version in `package.json`, and tag the new release:

```bash
git tag v1.0.1
git push --tags
```

Then, in each theme, change `v1.0.0` in the dependency's URL in `package.json` to the new tag and run `npm install`.
