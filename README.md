<h1 align="center">Obsidian Security Audit</h1>
<p align="center">
  <a href="https://github.com/jnaskali/obsidian-security-audit/wiki">Documentation</a> · <a href="https://github.com/jnaskali/obsidian-security-audit/issues">Report Bug</a>
</p>
<br>


A small proof‑of‑concept Obsidian plugin that inspects your installed community plugins, determines their npm package dependencies, and runs `npm audit` to report known vulnerabilities.

**Important: this is an early proof‑of‑concept aimed at technical users and testers.**

<img width="572" height="447" alt="image" src="https://github.com/user-attachments/assets/863b3cbc-c67c-45f8-8153-9d951c417790" />

## What it does

1. Scans your installed plugins.
2. Attempts to resolve a repository or package URL for each plugin.
3. Downloads package metadata (generates a fresh lockfile, if not available) to construct a dependency graph.
4. For each plugin, runs `npm audit` against the discovered dependency tree to find known vulnerabilities.
5. Presents a grouped report of vulnerabilities in the plugin UI.

## Limitations and notes

- The plugin only runs `npm audit` on demand.
- The audit is performed against the latest available package metadata in the upstream repository. If you are running an older plugin version, the results may differ. Update your plugins.
- This plugin does **not** perform static analysis or a source‑code security review of plugins — it only inspects package metadata and known advisories.

## Usage

1. Install the plugin:
   - When available via Community plugins: install there, or
   - Manually: copy the plugin files (main.js, manifest.js, styles.css) from releases (or build your own) into your vault's plugin folder:
     `.obsidian/plugins/obsidian-security-audit/`
2. Enable the plugin in Obsidian: Settings → Community plugins → Enable.
3. A shield icon appears in the left ribbon (taskbar). Click it to open the plugin menu.
4. Select **Run audit** to start a scan and security audit of installed community plugins.

UI notes
- The initial report UI is minimal: advisories are grouped by plugin and show severity and affected packages.
- No automatic remediation is performed — the tool reports known advisories only.


## Possible future features

- [ ] Optional scheduled audits (e.g., weekly) with optional pop‑ups for critical issues.
- [ ] Optional badge on the ribbon icon indicating the presence / severity of detected issues.
- [ ] Improved caching and background refresh of metadata.
- [ ] Stricter adherence to Obsidian's sandboxing model.
- [ ] Minimize the plugin's dependencies
- [ ] Better UX for non‑technical users: plain‑language explanations, one‑click guidance, and clearer remediation steps.


## Security and privacy

- Network access: required to fetch repository/package metadata and to query advisory databases.
- Local storage: audit results and cached metadata are stored locally in your vault/plugin folder.
- No telemetry: does not send telemetry beyond the required requests to registries and repository hosts.
  - Note on `npm audit`: the audit process involves interacting with npm services and sharing your plugins' dependency information with npm registry; consult npm documentation if you require offline or fully private audits.
- Sandbox: the plugin aims to be conservative, but doesn't fully comply with the idea of a sandbox.


## Prerequisites

- Node.js
- npm
- Obsidian (hehe)


## Development & testing

Typical workflow:

```bash
git clone https://github.com/jnaskali/obsidian-security-audit.git
cd obsidian-security-audit
npm install
npm run build                 # or `npm run dev` for watch mode
```

## Contributing

Contributions, suggestions, and bug reports are welcome.

