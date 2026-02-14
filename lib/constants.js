// Framework files that emit extracted CSS (Vue SFC, Svelte). React uses CSS imports → findCssImporters.
export const COMPONENT_WITH_STYLES = /\.(vue|svelte)$/;
// Extensions that need .js output in entryFileNames
export const SOURCE_EXT_TO_JS = {
    '.vue': '.js',
    '.tsx': '.js',
    '.jsx': '.js',
    '.svelte': '.js',
    '.ts': '.js',
    '.mts': '.mjs',
    '.cts': '.cjs',
    '.js': '.js',
    '.mjs': '.mjs',
    '.cjs': '.cjs',
};
export const CACHE_NAME = '.vite-incra-cache.json';
export const ENV_MODIFIED_FILE = 'VITE_PLUGIN_INCREMENTAL_MODIFIED_FILE';
// React/TS/JS, Vue, Svelte + styles + HTML
export const SOURCE_GLOB = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,vue,svelte,css,scss,sass,less,styl,stylus,html}';
// Only these extensions work as Rollup entry for partial build; CSS cannot be sole entry
export const PARTIAL_BUILD_EXT = /\.(tsx?|jsx?|mts|cts|mjs|cjs|vue|svelte)$/;
// Config files import Node/bundler deps – cannot be used as browser entry. Force full build.
export const CONFIG_FILE = /(?:^|\/)(?:vite|vitest|rollup|vike)\.(config|env)\.(ts|js|mts|mjs|cjs|cts)$/;
// Stylesheet extensions (incl. *.module.css for React): use importing module as entry for partial build
export const CSS_EXT = /\.(css|scss|sass|less|styl|stylus)$/;
