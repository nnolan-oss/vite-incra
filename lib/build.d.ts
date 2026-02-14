import type { UserConfig } from 'vite';
export declare const toDist: (...parts: string[]) => string;
export declare const buildBundle: (bundleName: string, _config: UserConfig, beforeBuildCallback?: () => void, watchMode?: boolean) => Promise<void>;
