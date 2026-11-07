#!/usr/bin/env node
/**
 * Refresh the versions in docs/market/index.json from the npm registry.
 *
 * The file is a format-1 plugin market index. For every entry whose versions
 * come from npm this script:
 *   - ensures `dist-tags.latest` is listed, with its real publish timestamp;
 *   - refreshes `publishTimestamp` of the versions npm still knows about;
 *   - carries `engines.dsh` from the published manifest for a newly added version.
 *
 * Usage:
 *   npm run market:index            # update the file
 *   npm run market:index:check      # exit 1 when the file is stale
 *   node scripts/update-market-index.mjs --dry-run
 */

import { readFile, writeFile } from 'node:fs/promises'

const INDEX_PATH = new URL('../docs/market/index.json', import.meta.url)
const DEFAULT_REGISTRY = 'https://registry.npmjs.org'

const flags = new Set(process.argv.slice(2))
const check = flags.has('--check')
const dryRun = check || flags.has('--dry-run')

/** The registry a plugin's npm versions come from, defaulting to npmjs. */
function registryOf (entry) {
  const declared = (entry.versions ?? []).find(
    version => version.source?.type === 'npm' && typeof version.source.registry === 'string'
  )
  return declared?.source.registry ?? DEFAULT_REGISTRY
}

/** Registry URL for one package; keep the scope's `@` readable. */
function packageUrl (registry, name) {
  const path = encodeURIComponent(name).replace(/^%40/u, '@')
  return `${registry.replace(/\/+$/u, '')}/${path}`
}

async function fetchMetadata (registry, name) {
  const url = packageUrl(registry, name)
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'deepclean-mydisk-market-index/1.0'
    }
  })
  if (!response.ok) throw new Error(`${name}: ${response.status} ${response.statusText} (${url})`)
  return response.json()
}

/** Unix seconds from the registry's `time` map, or undefined when unknown. */
function timestampOf (metadata, version) {
  const iso = metadata.time?.[version]
  if (typeof iso !== 'string') return undefined
  const millis = Date.parse(iso)
  return Number.isFinite(millis) ? Math.floor(millis / 1000) : undefined
}

/** The published `engines.dsh` range, when it is usable as a SemVer range. */
function dshRangeOf (metadata, version) {
  const range = metadata.versions?.[version]?.engines?.dsh
  if (typeof range !== 'string') return undefined
  const trimmed = range.trim()
  if (trimmed === '' || trimmed.startsWith('workspace:')) return undefined
  return trimmed
}

async function refreshEntry (entry) {
  const npmVersions = (entry.versions ?? []).filter(version => version.source?.type === 'npm')
  if (npmVersions.length === 0) {
    console.log(`- ${entry.name}: skipped (no npm versions)`)
    return 0
  }

  const registry = registryOf(entry)
  const metadata = await fetchMetadata(registry, entry.name)
  const latest = metadata['dist-tags']?.latest
  if (typeof latest !== 'string') throw new Error(`${entry.name}: the registry has no dist-tags.latest`)

  const latestTimestamp = timestampOf(metadata, latest)
  if (latestTimestamp === undefined) throw new Error(`${entry.name}: the registry has no publish time for ${latest}`)

  let changed = 0
  const listed = entry.versions.find(version => version.version === latest)

  if (listed === undefined) {
    const engines = {}
    const dsh = dshRangeOf(metadata, latest)
    if (dsh !== undefined) engines.dsh = dsh
    entry.versions.unshift({
      version: latest,
      publishTimestamp: latestTimestamp,
      source: { ...npmVersions[0].source },
      engines
    })
    changed += 1
    console.log(`- ${entry.name}: added ${latest}`)
  } else {
    if (listed.publishTimestamp !== latestTimestamp) {
      listed.publishTimestamp = latestTimestamp
      changed += 1
    }
    console.log(`- ${entry.name}: latest ${latest} already listed`)
  }

  for (const version of entry.versions) {
    if (version.version === latest) continue
    const timestamp = timestampOf(metadata, version.version)
    if (timestamp !== undefined && version.publishTimestamp !== timestamp) {
      version.publishTimestamp = timestamp
      changed += 1
    }
  }

  return changed
}

async function main () {
  let index
  try {
    index = JSON.parse(await readFile(INDEX_PATH, 'utf8'))
  } catch (error) {
    throw new Error(`cannot read docs/market/index.json: ${error.message}`)
  }
  if (!Array.isArray(index.plugins)) throw new Error('docs/market/index.json: plugins must be an array')

  let changes = 0
  for (const entry of index.plugins) {
    changes += await refreshEntry(entry)
  }

  if (changes === 0) {
    console.log('docs/market/index.json is up to date')
    return
  }
  if (check) {
    console.error(`docs/market/index.json is stale (${changes} change(s)); run: npm run market:index`)
    process.exitCode = 1
    return
  }
  if (dryRun) {
    console.log(`dry run: ${changes} change(s) not written`)
    return
  }

  await writeFile(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  console.log(`wrote docs/market/index.json (${changes} change(s))`)
}

main().catch((error) => {
  console.error(`market index refresh failed: ${error.message}`)
  process.exitCode = 1
})
