#!/usr/bin/env node
import { runIncrementalBuild } from '../index.js';
const force = process.argv.includes('--force');
runIncrementalBuild(undefined, { force }).catch((err) => {
    console.error(err);
    process.exit(1);
});
