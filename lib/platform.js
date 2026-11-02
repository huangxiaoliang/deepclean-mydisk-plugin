import path from 'node:path'

// Protection is checked again on the host, independently of UI selection.
export function isProtected(target, whitelist, platform = process.platform) {
  const paths = platform === 'win32' ? path.win32 : path.posix
  if (typeof target !== 'string' || !paths.isAbsolute(target)) return false
  return whitelist.some((root) => {
    if (typeof root !== 'string' || !paths.isAbsolute(root)) return false
    const contains = (parent, child) => {
      const relative = paths.relative(paths.resolve(parent), paths.resolve(child))
      return relative === '' || (relative !== '..' && !relative.startsWith('..' + paths.sep) && !paths.isAbsolute(relative))
    }
    // Removing an ancestor would also remove the protected descendant.
    return contains(root, target) || contains(target, root)
  })
}

export function parseTreeOutput(out, platform = process.platform) {
  const children = []
  for (const line of out.split(/\r?\n/)) {
    const idx = line.indexOf('\t')
    if (idx < 1) continue
    const size = Number(line.slice(0, idx))
    const target = line.slice(idx + 1)
    if (!Number.isFinite(size) || size < 0 || !target) continue
    children.push({ path: target, kb: platform === 'win32' ? size / 1024 : size })
  }
  return children
}
