/**
 * wordpressCjsExternals — companion to @roots/vite-plugin's `wordpressPlugin()`.
 *
 * `wordpressPlugin()` rewrites ESM `import … from '@wordpress/*'` to the
 * `window.wp.*` globals WordPress already loads. CommonJS dependencies (e.g.
 * `@10up/block-components`) `require()` those packages instead, which
 * Rolldown cannot resolve against externals at runtime. This plugin:
 *
 *  1. Rewrites `require('<pkg>')` in matching files to the global WordPress
 *     provides, using the same mapping as `wordpressPlugin()` (WordPress's
 *     official `defaultRequestToExternal`), so packages WordPress does not ship
 *     as globals — e.g. `@wordpress/icons` — stay bundled.
 *  2. Points every `react`, `react-dom` and `react/jsx-runtime` import (ESM and
 *     CJS, theme source included) at WordPress's copies, so hooks share one
 *     React instance.
 *  3. Adds the script handles of everything it externalised to the
 *     `editor.deps.json` asset emitted by `wordpressPlugin()`, so the PHP side
 *     enqueues them — not just the handles your own ESM code imports.
 *
 * Usage (vite.config.js):
 *
 *   import { wordpressPlugin } from '@roots/vite-plugin';
 *   import wordpressCjsExternals from 'vite-plugin-wp-cjs-externals';
 *
 *   plugins: [
 *     wordpressCjsExternals(),
 *     wordpressPlugin(),
 *     …
 *   ]
 */
import {
  defaultRequestToExternal,
  defaultRequestToHandle,
} from '@wordpress/dependency-extraction-webpack-plugin/lib/util';

const REACT_GLOBALS = {
  react: { global: 'window.React', handle: 'react' },
  'react-dom': { global: 'window.ReactDOM', handle: 'react-dom' },
  'react/jsx-runtime': { global: 'window.ReactJSXRuntime', handle: 'react-jsx-runtime' },
};

const VIRTUAL_PREFIX = '\0wp-global:';

const REQUIRE_PATTERN = /require\(\s*["']((?:@wordpress\/[a-z0-9-]+(?:\/[a-z0-9-]+)*)|react|react-dom|react\/jsx-runtime)["']\s*\)/g;

/**
 * @param {object}   [options]
 * @param {RegExp}   [options.include]  Files whose require() calls are rewritten.
 * @param {string[]} [options.bundle]   Extra packages to keep bundled even if WordPress ships them.
 * @param {string}   [options.depsFile] Name of the deps asset emitted by wordpressPlugin().
 * @returns {import('vite').Plugin[]}
 */
export default function wordpressCjsExternals({
  include = /\/node_modules\//,
  bundle = [],
  depsFile = 'editor.deps.json',
} = {}) {
  const handles = new Set();

  /** Global expression for a request, or null to leave it bundled. */
  const globalFor = (request) => {
    if (bundle.includes(request)) return null;
    if (request in REACT_GLOBALS) return REACT_GLOBALS[request].global;

    const external = defaultRequestToExternal(request);
    if (!external) return null;

    return Array.isArray(external) ? `window.${external.join('.')}` : `window.${external}`;
  };

  const handleFor = (request) =>
    REACT_GLOBALS[request]?.handle ?? defaultRequestToHandle(request);

  const rewrite = {
    name: 'wordpress-cjs-externals',
    enforce: 'pre',

    transform(code, id) {
      if (!include.test(id) || !code.includes('require(')) return null;

      const replaced = code.replace(REQUIRE_PATTERN, (match, request) => {
        const global = globalFor(request);
        if (!global) return match;

        const handle = handleFor(request);
        if (handle) handles.add(handle);

        return global;
      });

      return replaced === code ? null : { code: replaced, map: null };
    },

    // ESM `import … from 'react'` anywhere (deps or theme source) → WordPress's React.
    resolveId(id) {
      return id in REACT_GLOBALS && !bundle.includes(id) ? `${VIRTUAL_PREFIX}${id}` : null;
    },

    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return null;

      const request = id.slice(VIRTUAL_PREFIX.length);
      handles.add(REACT_GLOBALS[request].handle);

      return `module.exports = ${REACT_GLOBALS[request].global};`;
    },
  };

  // Runs after wordpressPlugin() has emitted the deps asset, then merges ours in.
  const mergeDeps = {
    name: 'wordpress-cjs-externals:deps',
    enforce: 'post',

    generateBundle(_options, bundleOutput) {
      if (!handles.size) return;

      const asset = Object.values(bundleOutput).find(
        (file) =>
          file.type === 'asset' &&
          (file.originalFileNames?.includes(depsFile) ||
            file.names?.includes(depsFile) ||
            file.name === depsFile),
      );

      if (!asset) {
        this.warn(`${depsFile} not found; is wordpressPlugin() registered?`);
        return;
      }

      const existing = JSON.parse(String(asset.source));
      asset.source = JSON.stringify([...new Set([...existing, ...handles])], null, 2);
    },
  };

  return [rewrite, mergeDeps];
}
