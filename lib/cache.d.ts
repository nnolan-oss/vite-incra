import type { UserConfig } from 'vite';
import type { CacheData } from './types.js';
export declare function getCachePath(config: UserConfig): string;
export declare function loadCache(cachePath: string): CacheData | null;
export declare function saveCache(cachePath: string, rootResolved: string, files: Record<string, number>): void;
export declare function getSourceFileMtimes(rootResolved: string): Record<string, number>;
export declare function getChangedFiles(cache: CacheData | null, current: Record<string, number>): string[];
