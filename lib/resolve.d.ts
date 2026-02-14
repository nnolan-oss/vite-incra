/** Find React/TS/JS modules that import the given stylesheet. Used to resolve CSS → importer for partial build. */
export declare function findCssImporters(cssPath: string, rootResolved: string): string[];
/** When modified file is a stylesheet, resolve to its importer module for partial build. */
export declare function resolveForPartialBuild(modifiedFile: string, rootResolved: string): string | null;
