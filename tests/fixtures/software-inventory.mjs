export function softwareInventory() {
  return {
    at: Date.now(), sources: [
      { id: 'demo-npm', name: 'npm', location: '/demo/.nvm/versions/node/v24/bin', status: 'ok' },
      { id: 'demo-uv', name: 'uv', location: '/demo/.local/bin', status: 'ok' },
      { id: 'desktop', name: 'macOS', location: '/Applications', status: 'ok' },
    ],
    items: [
      { id: 'demo-typescript', sourceId: 'demo-npm', provider: 'npm', packageId: 'typescript', name: 'TypeScript', version: '5.9.3', kind: 'terminal', location: '/demo/.nvm/versions/node/v24/lib/node_modules/typescript', executable: true, warnings: ['reinstall_required', 'external_usage_unknown', 'data_not_removed'] },
      { id: 'demo-ruff', sourceId: 'demo-uv', provider: 'uv', packageId: 'ruff', name: 'Ruff', version: '0.14.0', kind: 'terminal', location: '/demo/.local/share/uv/tools/ruff', executable: true, warnings: ['reinstall_required', 'data_not_removed'] },
      { id: 'demo-app', sourceId: 'desktop', provider: 'macOS', name: 'Sample Notes', version: '2.1', kind: 'desktop', action: 'move-app', location: '/demo/Applications/Sample Notes.app', executable: true, warnings: ['app_only', 'move_no_space', 'restore_files_only'] },
      { id: 'demo-protected', sourceId: 'demo-npm', provider: 'npm', name: 'npm', version: '11.0', kind: 'terminal', location: '/demo/.nvm/versions/node/v24/lib/node_modules/npm', executable: false, blockReason: 'protected_runtime', warnings: [] },
      { id: 'demo-running', sourceId: 'desktop', provider: 'macOS', name: 'Busy Player', version: '4.0', kind: 'desktop', location: '/demo/Applications/Busy Player.app', executable: false, blockReason: 'application_running', warnings: [] },
      { id: 'demo-vendor', sourceId: 'desktop', provider: 'macOS', name: 'Vendor Suite', version: '1.2', kind: 'desktop', location: '/demo/Applications/Vendor Suite.app', executable: false, blockReason: 'vendor_uninstaller_required', warnings: [] },
    ],
  }
}
