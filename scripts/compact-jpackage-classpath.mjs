#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";

const launcherConfig = process.argv[2];
if (!launcherConfig) {
    throw new Error("Usage: compact-jpackage-classpath.mjs <launcher-config>");
}

const content = await readFile(launcherConfig, "utf8");
const newline = content.includes("\r\n") ? "\r\n" : "\n";
let classpathWritten = false;
const compacted = content
    .split(/\r?\n/)
    .filter((line) => {
        if (!line.startsWith("app.classpath=")) return true;
        if (classpathWritten) return false;
        classpathWritten = true;
        return true;
    })
    .map((line) => (line.startsWith("app.classpath=") ? "app.classpath=$APPDIR/*" : line))
    .join(newline);

if (!classpathWritten) {
    throw new Error(`Launcher classpath was not generated: ${launcherConfig}`);
}

const temporaryConfig = `${launcherConfig}.tmp-${process.pid}`;
await writeFile(temporaryConfig, compacted, "utf8");
await rename(temporaryConfig, launcherConfig);
