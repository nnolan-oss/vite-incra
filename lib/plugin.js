import path from 'node:path';
import { ENV_MODIFIED_FILE } from './constants.js';
import { state } from './state.js';
import { patchConfig } from './config.js';
/** Vite plugin for incremental builds. Add to plugins in vite.config.ts */
export function incrementalBuild(options = {}) {
    state.storedPluginOptions = options;
    return {
        name: 'vite-incra',
        enforce: 'pre',
        config(config, _env) {
            patchConfig(config, { ignoreWarnings: true });
            const modifiedFile = process.env[ENV_MODIFIED_FILE];
            if (modifiedFile && config.build?.rollupOptions) {
                const root = config.root ?? '.';
                const modifiedPath = path.resolve(root, modifiedFile);
                const entryName = modifiedFile.split('.')[0] ?? modifiedFile;
                config.build.rollupOptions = {
                    ...config.build.rollupOptions,
                    input: { [entryName]: modifiedPath },
                };
            }
        },
        configurePreviewServer(server) {
            const validateUri = (req, res, next) => {
                try {
                    if (req.url)
                        decodeURIComponent(req.url);
                    next();
                }
                catch {
                    res.statusCode = 400;
                    res.end('Bad Request: Invalid URL encoding');
                }
            };
            const mw = server.middlewares;
            mw.stack.unshift({ route: '', handle: validateUri });
        },
    };
}
