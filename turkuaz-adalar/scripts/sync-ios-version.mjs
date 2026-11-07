/**
 * Copies package.json's version into the iOS project, mirroring Android:
 * "1.2.3" -> MARKETING_VERSION 1.2.3, CURRENT_PROJECT_VERSION 10203.
 * Run by `npm run ios:sync`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const parts = version.split(/[.-]/).slice(0, 3).map(Number)
if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
  console.error(`package.json version "${version}" is not MAJOR.MINOR.PATCH.`)
  process.exit(1)
}
const build = parts[0] * 10000 + parts[1] * 100 + parts[2]
const marketing = parts.join('.')

const projectFile = join(root, 'ios/App/App.xcodeproj/project.pbxproj')
const before = readFileSync(projectFile, 'utf8')
const after = before
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${marketing};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`)
if (after !== before) {
  writeFileSync(projectFile, after)
}
console.log(`iOS version ${marketing} (build ${build})`)
