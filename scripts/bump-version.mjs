// Bumps the app's version in app.config.json: `npm run version:patch` or `npm run version:minor`.
// Major only when User decides: `node scripts/bump-version.mjs major`.

import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../app.config.json', import.meta.url)
const part = process.argv[2]
if (!['major', 'minor', 'patch'].includes(part)) {
  console.error('Usage: node scripts/bump-version.mjs major|minor|patch')
  process.exit(1)
}

const config = JSON.parse(readFileSync(FILE, 'utf8'))
let [major, minor, patch] = config.version.split('.').map(Number)
if (part === 'major') [major, minor, patch] = [major + 1, 0, 0]
else if (part === 'minor') [minor, patch] = [minor + 1, 0]
else patch += 1

const from = config.version
config.version = `${major}.${minor}.${patch}`
writeFileSync(FILE, JSON.stringify(config, null, 2) + '\n')
console.log(`${from} → ${config.version}`)
