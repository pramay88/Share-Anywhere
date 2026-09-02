/// <reference types="node" />

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const fixtureDir = path.join(process.cwd(), "tests", "e2e", "fixtures");

mkdirSync(fixtureDir, { recursive: true });

export const testFiles = {
    small: path.join(fixtureDir, "small.txt"),
    image: path.join(fixtureDir, "test-image.png"),
};

writeFileSync(
    testFiles.small,
    "This is a test file used by Playwright E2E tests.",
);

export function createFile(
    filename: string,
    sizeInBytes: number,
    content = "x",
): string {
    const filePath = path.join(fixtureDir, filename);

    const buffer = Buffer.alloc(sizeInBytes, content);
    writeFileSync(filePath, buffer);

    return filePath;
}