import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const icon = resolve(root, 'apps/web/public/icon.png');
const outputDir = resolve(root, 'apps/web/public/splash');
const background = '#080D0B';

const devices = [
  ['iphone-15-pro-max', 1290, 2796, 430, 932, 3],
  ['iphone-15-pro', 1179, 2556, 393, 852, 3],
  ['iphone-14-plus', 1284, 2778, 428, 926, 3],
  ['iphone-13', 1170, 2532, 390, 844, 3],
  ['iphone-x', 1125, 2436, 375, 812, 3],
  ['iphone-xr', 828, 1792, 414, 896, 2],
  ['iphone-se', 750, 1334, 375, 667, 2],
  ['ipad-pro-12', 2048, 2732, 1024, 1366, 2],
  ['ipad-10', 1620, 2160, 810, 1080, 2],
  ['ipad-mini', 1488, 2266, 744, 1133, 2],
];

mkdirSync(outputDir, { recursive: true });

for (const [name, width, height, cssWidth, cssHeight, ratio] of devices) {
  const logo = Math.round(Math.min(width, height) * 0.28);
  const output = resolve(outputDir, `${name}.png`);
  execFileSync('convert', [
    '-size',
    `${width}x${height}`,
    `xc:${background}`,
    '(',
    icon,
    '-resize',
    `${logo}x${logo}`,
    ')',
    '-gravity',
    'center',
    '-composite',
    output,
  ]);
  console.log(
    `${name}.png ${width}x${height} (${cssWidth}x${cssHeight} @${ratio}x)`,
  );
}
