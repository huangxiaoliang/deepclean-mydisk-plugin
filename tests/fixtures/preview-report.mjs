// Synthetic paths and sizes for the isolated browser preview. No user files are accessed.
export function previewReport() {
  const home = '/demo'
  const gb = 1024 ** 2
  return {
    platform: 'macos', home, elapsed: 3,
    disk: { total: 228.3 * 1024 ** 3, used: 133.9 * 1024 ** 3, free: 94.4 * 1024 ** 3 },
    fda: { status: 'granted' },
    leftoverGroups: [{ baseId: 'demo.old-app', name: '旧应用缓存', bucket: 'safe', count: 1, kb: .8 * gb, paths: [home + '/Library/Containers/old-app'], why: '已卸载应用的缓存残留' }],
    devCaches: [
      { path: home + '/Library/Developer/Xcode/DerivedData', kb: 1.6 * gb, advice: 'Xcode 构建缓存，安全可再生', cleanable: true },
      { path: home + '/.npm/_cacache', kb: .8 * gb, advice: 'npm cache clean --force', cleanable: true },
      { path: home + '/.m2/repository', kb: .4 * gb, advice: 'Maven 本地仓库；离线构建可能受影响', cleanable: true },
      { path: home + '/Library/Developer/Xcode/Archives', kb: 3 * gb, advice: 'App 归档；提交/回滚可能需要，需确认', cleanable: false },
    ],
    browsers: [{ name: 'Chrome', path: home + '/Library/Caches/Chrome', kb: 1.6 * gb }],
    caches: [],
    special: [{ app: '企业微信', categories: [
      { name: '缓存', cleanable: true, kb: .2 * gb, paths: [home + '/Library/Caches/WeCom'] },
      { name: '聊天文件', cleanable: false, kb: 4 * gb, paths: [home + '/Documents/WeCom/Files'] },
    ] }],
    bigFiles: [{path:"/demo/Documents/archive.zip",kb:4*gb,ext:".zip",mtime:1700000000},{path:"/demo/Downloads/installer.dmg",kb:2*gb,ext:".dmg",mtime:1750000000},{path:"/demo/Pictures/video.mov",kb:1*gb,ext:".mov",mtime:1760000000}], estimate: { totalKb: 5.4 * gb, safeKb: .8 * gb, cacheKb: 1.8 * gb, devKb: 2.8 * gb },
  }
}
