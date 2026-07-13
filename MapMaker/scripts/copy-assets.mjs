import { cp, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/styles/", import.meta.url), { recursive: true });
await cp(new URL("../src/styles/map-maker.css", import.meta.url), new URL("../dist/styles/map-maker.css", import.meta.url));
