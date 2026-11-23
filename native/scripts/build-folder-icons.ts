// SPDX-License-Identifier: GPL-3.0-or-later
//
// Writes the Files view's own SVG icons into native/Resources/MaterialIcons,
// in the same format as Material Icon Theme's folder icons:
//
//   <svg viewBox="0 0 16 16"><path id="folder" …/><path id="motive" …/></svg>
//
// - The folder outline is Material Icon Theme's (MIT), shared by all its folders.
// - Each motive is a Material Design Icons glyph (Pictogrammers, Apache-2.0,
//   @mdi/svg 7.4.47) scaled into the lower right, where Material places its
//   motives. Coordinates are baked into the path data; no transform attribute.
//
// Outputs (prefixed mcv- so they are never mistaken for Material's own files):
//   - mcv-folder-<name>.svg: folders Material has no icon for (Minecraft's).
//   - mcv-folder.svg and mcv-file.svg: the plain folder and file, in Material's
//     default blue-grey (#90a4ae); Material generates its own at build time.
//
// Usage: bun native/scripts/build-folder-icons.ts
//   Rewrites a file only when its content changes. Run it after changing a
//   color or motive below, then commit the SVGs.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(SCRIPT_DIR, '..', '..');
const OUTPUT_DIR = join(SCRIPT_DIR, '..', 'Resources', 'MaterialIcons');

/** Material Icon Theme's folder outline (icons/folder-*.svg, path id="folder"). */
const FOLDER_PATH =
  'm6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232';

/** Material's default folder and file color. */
const PLAIN = '#90a4ae';

/** Material Design Icons glyphs (24×24), copied from @mdi/svg 7.4.47. */
const MDI = {
  earth:
    'M17.9,17.39C17.64,16.59 16.89,16 16,16H15V13A1,1 0 0,0 14,12H8V10H10A1,1 0 0,0 11,9V7H13A2,2 0 0,0 15,5V4.59C17.93,5.77 20,8.64 20,12C20,14.08 19.2,15.97 17.9,17.39M11,19.93C7.05,19.44 4,16.08 4,12C4,11.38 4.08,10.78 4.21,10.21L9,15V16A2,2 0 0,0 11,18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z',
  fire: 'M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.22 9.78 15.46 9.35 14.82 8.72C13.33 7.26 13 4.85 13.95 3C13 3.23 12.17 3.75 11.46 4.32C8.87 6.4 7.85 10.07 9.07 13.22C9.11 13.32 9.15 13.42 9.15 13.55C9.15 13.77 9 13.97 8.8 14.05C8.57 14.15 8.33 14.09 8.14 13.93C8.08 13.88 8.04 13.83 8 13.76C6.87 12.33 6.69 10.28 7.45 8.64C5.78 10 4.87 12.3 5 14.47C5.06 14.97 5.12 15.47 5.29 15.97C5.43 16.57 5.7 17.17 6 17.7C7.08 19.43 8.95 20.67 10.96 20.92C13.1 21.19 15.39 20.8 17.03 19.32C18.86 17.66 19.5 15 18.56 12.72L18.43 12.46C18.22 12 17.66 11.2 17.66 11.2M14.5 17.5C14.22 17.74 13.76 18 13.4 18.1C12.28 18.5 11.16 17.94 10.5 17.28C11.69 17 12.4 16.12 12.61 15.23C12.78 14.43 12.46 13.77 12.33 13C12.21 12.26 12.23 11.63 12.5 10.94C12.69 11.32 12.89 11.7 13.13 12C13.9 13 15.11 13.44 15.37 14.8C15.41 14.94 15.43 15.08 15.43 15.23C15.46 16.05 15.1 16.95 14.5 17.5H14.5Z',
  creation:
    'M19,1L17.74,3.75L15,5L17.74,6.26L19,9L20.25,6.26L23,5L20.25,3.75M9,4L6.5,9.5L1,12L6.5,14.5L9,20L11.5,14.5L17,12L11.5,9.5M19,15L17.74,17.74L15,19L17.74,20.25L19,23L20.25,20.25L23,19L20.25,17.74',
  tag: 'M5.5,7A1.5,1.5 0 0,1 4,5.5A1.5,1.5 0 0,1 5.5,4A1.5,1.5 0 0,1 7,5.5A1.5,1.5 0 0,1 5.5,7M21.41,11.58L12.41,2.58C12.05,2.22 11.55,2 11,2H4C2.89,2 2,2.89 2,4V11C2,11.55 2.22,12.05 2.59,12.41L11.58,21.41C11.95,21.77 12.45,22 13,22C13.55,22 14.05,21.77 14.41,21.41L21.41,14.41C21.78,14.05 22,13.55 22,13C22,12.44 21.77,11.94 21.41,11.58Z',
  cube: 'M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5M12,4.15L6.04,7.5L12,10.85L17.96,7.5L12,4.15Z',
  palette:
    'M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z',
  alert: 'M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z',
  grid: 'M10,4V8H14V4H10M16,4V8H20V4H16M16,10V14H20V10H16M16,16V20H20V16H16M14,20V16H10V20H14M8,20V16H4V20H8M8,14V10H4V14H8M8,8V4H4V8H8M10,14H14V10H10V14M4,2H20A2,2 0 0,1 22,4V20A2,2 0 0,1 20,22H4C2.92,22 2,21.1 2,20V4A2,2 0 0,1 4,2Z',
  newspaper:
    'M20 3H4C2.89 3 2 3.89 2 5V19C2 20.11 2.89 21 4 21H20C21.11 21 22 20.11 22 19V5C22 3.89 21.11 3 20 3M5 7H10V13H5V7M19 17H5V15H19V17M19 13H12V11H19V13M19 9H12V7H19V9Z',
  bucket: 'M3 4H21V7H20L17.5 21H6.5L4 7H3V4Z',
  file: 'M13,9V3.5L18.5,9M6,2C4.89,2 4,2.89 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6Z',
} as const;

/** Minecraft's folders: name in the file name, folder color, motive color, glyph. */
const MINECRAFT_FOLDERS: [string, string, string, keyof typeof MDI][] = [
  ['world', '#4caf50', '#c8e6c9', 'earth'],
  ['world-nether', '#e53935', '#ffcdd2', 'fire'],
  ['world-end', '#7e57c2', '#d1c4e9', 'creation'],
  ['versions', '#607d8b', '#cfd8dc', 'tag'],
  ['datapacks', '#8bc34a', '#dcedc8', 'cube'],
  ['resourcepacks', '#ff7043', '#ffccbc', 'palette'],
  ['crash-reports', '#e53935', '#ffcdd2', 'alert'],
  ['schematics', '#26c6da', '#b2ebf2', 'grid'],
  ['paper', '#42a5f5', '#bbdefb', 'newspaper'],
  ['bukkit', '#fb8c00', '#ffe0b2', 'bucket'],
];

/** Where Material puts a folder's motive: a 9-unit square in the lower right. */
const MOTIVE = { x: 7.5, y: 5.5, size: 9 };

/** Scales and moves SVG path data, keeping every command (arcs included). */
function transformPath(d: string, scale: number, dx: number, dy: number): string {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const out: string[] = [];
  let command = '';
  let index = 0;
  const next = () => Number(tokens[index++]);
  const round = (value: number) => String(Math.round(value * 1000) / 1000);
  const point = (relative: boolean) => {
    const x = next() * scale + (relative ? 0 : dx);
    const y = next() * scale + (relative ? 0 : dy);
    return `${round(x)} ${round(y)}`;
  };
  while (index < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[index])) command = tokens[index++];
    const relative = command === command.toLowerCase();
    switch (command.toUpperCase()) {
      case 'Z':
        out.push(command);
        continue;
      case 'M':
      case 'L':
      case 'T':
        out.push(`${command}${point(relative)}`);
        // Coordinates after a moveto are implicit linetos.
        if (command === 'M') command = 'L';
        if (command === 'm') command = 'l';
        break;
      case 'H':
        out.push(`${command}${round(next() * scale + (relative ? 0 : dx))}`);
        break;
      case 'V':
        out.push(`${command}${round(next() * scale + (relative ? 0 : dy))}`);
        break;
      case 'C':
        out.push(`${command}${point(relative)} ${point(relative)} ${point(relative)}`);
        break;
      case 'S':
      case 'Q':
        out.push(`${command}${point(relative)} ${point(relative)}`);
        break;
      case 'A': {
        const rx = round(next() * scale);
        const ry = round(next() * scale);
        const rotation = next();
        const large = next();
        const sweep = next();
        out.push(`${command}${rx} ${ry} ${rotation} ${large} ${sweep} ${point(relative)}`);
        break;
      }
      default:
        throw new Error(`Unsupported path command: ${command}`);
    }
  }
  return out.join('');
}

function svg(paths: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${paths}</svg>\n`;
}

function folderIcon(color: string, light?: string, glyph?: keyof typeof MDI): string {
  let paths = `<path id="folder" fill="${color}" d="${FOLDER_PATH}"/>`;
  if (light && glyph) {
    const scale = MOTIVE.size / 24;
    const motive = transformPath(MDI[glyph], scale, MOTIVE.x, MOTIVE.y);
    paths += `<path id="motive" fill="${light}" d="${motive}"/>`;
  }
  return svg(paths);
}

async function writeIfChanged(name: string, content: string): Promise<boolean> {
  const path = join(OUTPUT_DIR, name);
  const current = await readFile(path, 'utf8').catch(() => null);
  if (current === content) return false;
  await writeFile(path, content);
  console.log(`wrote ${relative(ROOT_DIR, path)}`);
  return true;
}

const icons: [string, string][] = [
  ['mcv-folder.svg', folderIcon(PLAIN)],
  // The plain file fills the square like Material's file icons.
  ['mcv-file.svg', svg(`<path fill="${PLAIN}" d="${transformPath(MDI.file, 16 / 24, 0, 0)}"/>`)],
  ...MINECRAFT_FOLDERS.map(([name, color, light, glyph]): [string, string] => [
    `mcv-folder-${name}.svg`,
    folderIcon(color, light, glyph),
  ]),
];

let changed = 0;
for (const [name, content] of icons) {
  if (await writeIfChanged(name, content)) changed += 1;
}
console.log(changed === 0 ? 'Icons are up to date.' : `Updated ${changed} icon(s).`);
