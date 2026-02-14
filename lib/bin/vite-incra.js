#!/usr/bin/env node
import { runIncrementalBuild } from '../index.js';
runIncrementalBuild().catch((err) => {
    console.error(err);
    process.exit(1);
});
