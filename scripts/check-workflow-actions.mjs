import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workflowDirectory = resolve(process.cwd(), '.github', 'workflows');
const immutableRefPattern = /^[0-9a-f]{40}$/;
const failures = [];

for (const fileName of readdirSync(workflowDirectory).sort()) {
  if (!fileName.endsWith('.yml') && !fileName.endsWith('.yaml')) continue;

  const filePath = resolve(workflowDirectory, fileName);
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/);
    if (!match) return;

    const actionReference = match[1];
    const separator = actionReference.lastIndexOf('@');
    if (separator < 1) return;

    const ref = actionReference.slice(separator + 1);
    if (!immutableRefPattern.test(ref)) {
      failures.push(`${fileName}:${index + 1}: ${actionReference}`);
    }
  });
}

if (failures.length > 0) {
  console.error('Mutable GitHub Action references found:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('All GitHub Action references are pinned to commit SHAs.');
}
