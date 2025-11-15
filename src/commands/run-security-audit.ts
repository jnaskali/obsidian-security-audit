import { App } from 'obsidian';
import { ProgressModal } from '../ui/modals';
import { PluginManifestEntry, CacheMetadata } from '../types';
import { getMaxSeverity } from '../ui/modals/utils';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import { IncomingMessage } from 'http';
import SecurityAudit from '../main';
import { downloadManifestWithCache, updateRepoDetails, downloadPackageFile } from '../utils/download';

const execAsync = promisify(exec);

export async function runSecurityAudit(plugin: SecurityAudit) {
	const app = plugin.app;
	const debug = plugin.settings.debugLogging;

	const modal = new ProgressModal(app, plugin);
	modal.open();

	const logDebug = (message: string) => {
		if (debug) console.log(`[Security Audit] ${message}`);
	};

	try {
		modal.updateProgress(0, 'Reading installed plugins...');
		logDebug('Starting security audit');

		// Read installed plugins
		const installedContent = await app.vault.adapter.read('.obsidian/community-plugins.json');
		const installedPlugins: string[] = JSON.parse(installedContent);
		logDebug(`Found ${installedPlugins.length} installed plugins`);

		if (installedPlugins.length === 0) {
			modal.updateProgress(100, 'No plugins installed.');
			return;
		}

		// Get cache dir
		const cacheDir = plugin.getCacheDir();
		logDebug(`Init cache directory: ${cacheDir}`);
		await fs.mkdir(cacheDir, { recursive: true });

		const manifestPath = path.join(cacheDir, 'installed-manifest.json');

		let installedManifest: PluginManifestEntry[];

		// Try to load cached manifest
		try {
			const cachedContent = await fs.readFile(manifestPath, 'utf-8');
			const cachedManifest: PluginManifestEntry[] = JSON.parse(cachedContent);
			const cachedIds = new Set(cachedManifest.map(p => p.id));
			const allPresent = installedPlugins.every(id => cachedIds.has(id));
			if (allPresent) {
				installedManifest = cachedManifest;
				logDebug(`Using cached manifest with ${installedManifest.length} entries`);
			} else {
				throw new Error('Cached manifest missing some plugins');
			}
		} catch (err) {
			logDebug(`Cached manifest not usable: ${err.message}`);
			modal.updateProgress(5, 'Downloading plugin manifest...');

			// Download full manifest with cache checking
			const fullManifest: PluginManifestEntry[] = await downloadManifestWithCache(cacheDir, plugin.settings.lastAuditTimestamp, logDebug);
			logDebug(`Downloaded full plugin manifest with ${fullManifest.length} entries`);

			modal.updateProgress(10, 'Filtering manifest...');

			// Filter to installed plugins
			installedManifest = fullManifest.filter(p => installedPlugins.includes(p.id));
			logDebug(`Filtered manifest to ${installedManifest.length} installed plugins`);

			// Add plugins not in global manifest
			const manifestIds = new Set(fullManifest.map(p => p.id));
			const missingIds = installedPlugins.filter(id => !manifestIds.has(id));
			for (const id of missingIds) {
				try {
					const pluginDir = path.join(plugin.getVaultPath(), '.obsidian', 'plugins', id);
					const manifestPath = path.join(pluginDir, 'manifest.json');
					const manifestContent = await fs.readFile(manifestPath, 'utf-8');
					const localManifest = JSON.parse(manifestContent);
					installedManifest.push({
						id,
						name: localManifest.name || id,
						author: localManifest.author || '',
						description: localManifest.description || '',
						// repo: undefined
					});
				} catch (err) {
					// If can't read local manifest, use id
					installedManifest.push({
						id,
						name: id,
						author: '',
						description: '',
					});
				}
			}
			logDebug(`Added ${missingIds.length} local plugins without online repository`);
		}

		const tempDirs = new Map<string, string>();
		const repoErrors = new Map<string, string>();

		let failedDownloadCount = 0;

		modal.updateProgress(15, 'Downloading plugin files...');

		const totalPlugins = installedManifest.length;
		let downloaded = 0;

		// Process package files for all plugins
		for (const p of installedManifest) {
			if (!p.repo) {
				// Skip plugins without known repository
				continue;
			}

			logDebug(`Processing package files for ${p.name} in ${p.repo}`);

			const tempDir = path.join(cacheDir, "packages", p.id);
			await fs.mkdir(tempDir, { recursive: true });

			let branch: string;
			let repoWasUpdated: boolean;
			try {
				const result = await updateRepoDetails(p.repo, p, logDebug, plugin.settings.githubAccessToken);
				branch = result.branch;
				repoWasUpdated = result.repoWasUpdated;
				p.defaultBranch = branch;
			} catch (err) {
				logDebug(`[${p.id}] Repository details failed: ${err.message}, proceeding with cache if available`);
				repoErrors.set(p.id, err.message);
				branch = 'main'; // fallback
				repoWasUpdated = false; // assume not updated to use cache
			}

			try {
				// Download package.json and package-lock.json with cache checking
				const packageJsonResult = await downloadPackageFile(p, branch, repoWasUpdated, cacheDir, 'package.json', logDebug);
				if (!packageJsonResult.downloaded && !packageJsonResult.cached) {
					throw new Error(`[${p.id}] Missing package.json`);
				}

				const packageLockResult = await downloadPackageFile(p, branch, repoWasUpdated, cacheDir, 'package-lock.json', logDebug);
				if (!packageLockResult.downloaded && !packageLockResult.cached) {
					try {
						await execAsync('npm i --package-lock-only --legacy-peer-deps', { cwd: tempDir });
						logDebug(`[${p.id}] Generated package-lock.json`);
					} catch (genErr) {
						logDebug(`[${p.id}] Failed to generate package-lock.json: ${genErr.message}`);
					}
				}

				tempDirs.set(p.id, tempDir);
				logDebug(`[${p.id}] Package files ok.`);
			} catch (err) {
				failedDownloadCount++;
				logDebug(`[${p.id}] Failed to process package files: ${err.message}`);
			}

			downloaded++;
			modal.updateProgress(15 + (downloaded / totalPlugins) * 40, `Downloaded ${downloaded}/${totalPlugins} plugin files`);
		}

		// Save manifest (lastUpdated timestamps already set during download)
		await fs.writeFile(manifestPath, JSON.stringify(installedManifest, null, 2));
		logDebug(`Updated and saved manifest to ${manifestPath}`);

		modal.updateProgress(55, 'Auditing plugins...');

		let criticalCount = 0;
		let highCount = 0;
		let moderateCount = 0;
		let lowCount = 0;
		let infoCount = 0;
		let noIssuesCount = 0;
		let auditIncompleteCount = 0;
		let noRepoCount = 0;

		// Now audit all
		let audited = 0;
		let logContent = '';

		for (const p of installedManifest) {
			const tempDir = tempDirs.get(p.id);
			if (!tempDir) {
				if (!p.repo) {
					noRepoCount++;
					logContent += `=== ${p.name} (${p.id}) ===\nNo repository\n\n`;
					logDebug(`Skipped auditing ${p.name}: no repository`);
					audited++;
					continue;
				}
				failedDownloadCount++;
				const errorMsg = repoErrors.get(p.id) || "Error: Files not downloaded";
				logContent += `=== ${p.name} (${p.id}) ===\n${errorMsg}\n\n`;
				logDebug(`Skipped auditing ${p.name}: files not downloaded`);
				audited++;
				continue;
			}
			logDebug(`Auditing ${p.name} in ${tempDir}`);

			try {
				const result = await new Promise<{output: string, maxSeverity: string, incomplete: boolean}>((resolve, reject) => {
					const auditProc = exec('npm audit --json', { cwd: tempDir });
					let output = '';
					auditProc.stdout?.on('data', (data) => output += data);
					auditProc.on('close', (code) => {
						let incomplete = false;
						let maxSeverity = 'none';
						try {
							const auditResult = JSON.parse(output);
							// Check if npm audit returned an error (e.g., ENOLOCK)
							if (auditResult.error) {
								incomplete = true;
								maxSeverity = 'none';
							} else if (auditResult.vulnerabilities) {
								const result = getMaxSeverity(auditResult.vulnerabilities);
								maxSeverity = result.maxSeverity;
							}
						} catch (e) {
							incomplete = true;
							maxSeverity = 'none';
						}
						resolve({output, maxSeverity, incomplete});
					});
					auditProc.on('error', reject);
				});

				const {output: stdout, maxSeverity, incomplete} = result;
				
				if (incomplete) {
					auditIncompleteCount++;
				} else if (maxSeverity === 'critical') {
					criticalCount++;
				} else if (maxSeverity === 'high') {
					highCount++;
				} else if (maxSeverity === 'moderate') {
					moderateCount++;
				} else if (maxSeverity === 'low') {
					lowCount++;
				} else if (maxSeverity === 'info') {
					infoCount++;
				} else {
					noIssuesCount++;
				}

				logContent += `=== ${p.name} (${p.id}) ===\n${stdout}\n\n`;
				logDebug(`Audited ${p.name} successfully`);
			} catch (err) {
				auditIncompleteCount++;
				logContent += `=== ${p.name} (${p.id}) ===\nError: ${err.message}\n\n`;
				logDebug(`Failed to audit ${p.name}: ${err.message}`);
			}

			audited++;
			modal.updateProgress(55 + (audited / totalPlugins) * 40, `Audited ${audited}/${totalPlugins} plugins`, false, '', undefined, {critical: criticalCount, high: highCount, moderate: moderateCount, low: lowCount, info: infoCount, noIssues: noIssuesCount, failedDownload: failedDownloadCount, auditIncomplete: auditIncompleteCount, noRepo: noRepoCount});
		}

		modal.updateProgress(95, 'Saving audit log...');

		// Save log to cache
		const auditLogPath = path.join(cacheDir, 'audit.log');
		await fs.writeFile(auditLogPath, logContent);
		logDebug(`Saved log to ${auditLogPath}`);

		// Save to settings
		const auditTimestamp = Date.now();
		plugin.settings.lastAuditTimestamp = auditTimestamp;
		plugin.settings.lastAuditSummary = {critical: criticalCount, high: highCount, moderate: moderateCount, low: lowCount, info: infoCount, noIssues: noIssuesCount, failedDownload: failedDownloadCount, auditIncomplete: auditIncompleteCount, noRepo: noRepoCount};
		plugin.settings.lastAuditLog = logContent;
		await plugin.saveSettings();

		// Show report in the same modal
		modal.showReport({critical: criticalCount, high: highCount, moderate: moderateCount, low: lowCount, info: infoCount, noIssues: noIssuesCount, failedDownload: failedDownloadCount, auditIncomplete: auditIncompleteCount, noRepo: noRepoCount}, logContent);

	} catch (err) {
		logDebug(`Audit failed: ${err.message}`);
		modal.updateProgress(100, `Error: ${err.message}`);
	}
}

