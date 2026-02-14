import type { UserConfig } from 'vite';
/** Patch config with incremental build prerequisites. Used internally by the plugin. */
export declare const patchConfig: (config: UserConfig, { ignoreWarnings }?: {
    ignoreWarnings?: boolean | undefined;
}) => UserConfig;
