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
		logDebug(`Cache directory: ${cacheDir}`);
		logDebug('Ensuring cache directory exists');
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
			logDebug(`Downloaded manifest with ${fullManifest.length} entries`);

			modal.updateProgress(10, 'Filtering manifest...');

			// Filter to installed plugins
			installedManifest = fullManifest.filter(p => installedPlugins.includes(p.id));
			logDebug(`Filtered to ${installedManifest.length} installed plugins`);

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
			logDebug(`Added ${missingIds.length} plugins without online repository`);
		}

		const tempDirs = new Map<string, string>();

		let failedDownloadCount = 0;

		modal.updateProgress(15, 'Downloading plugin files...');

		const totalPlugins = installedManifest.length;
		let downloaded = 0;

		// Download files for all first
		for (const p of installedManifest) {
			if (!p.repo) {
				// Skip plugins without repository
				continue;
			}

			logDebug(`Downloading files for ${p.name} from ${p.repo}`);

			try {
				let branch = p.defaultBranch;
				if (!branch) {
					branch = await getDefaultBranch(p.repo, p);
					p.defaultBranch = branch;
				}
				const tempDir = path.join(cacheDir, "packages", p.id);
				const packageJsonPath = path.join(tempDir, 'package.json');
				const packageLockPath = path.join(tempDir, 'package-lock.json');

				await fs.mkdir(tempDir, { recursive: true });

				const packageJsonUrl = `https://raw.githubusercontent.com/${p.repo}/${branch}/package.json`;
				const packageJsonRelativePath = `packages/${p.id}/package.json`;
				logDebug(`Downloading package.json for ${p.name} from ${packageJsonUrl}`);
				const packageJsonResult = await downloadFileWithMetadata(packageJsonUrl, packageJsonPath, cacheDir, packageJsonRelativePath, logDebug);

				const packageLockUrl = `https://raw.githubusercontent.com/${p.repo}/${branch}/package-lock.json`;
				const packageLockRelativePath = `packages/${p.id}/package-lock.json`;
				let packageLockResult;
				try {
					logDebug(`Attempting to download package-lock.json for ${p.name} from ${packageLockUrl}`);
					packageLockResult = await downloadFileWithMetadata(packageLockUrl, packageLockPath, cacheDir, packageLockRelativePath, logDebug);
				} catch (err) {
					logDebug(`No package-lock.json for ${p.name}`);
				}

				// Log cache decisions
				const lastAuditDate = plugin.settings.lastAuditTimestamp ? new Date(plugin.settings.lastAuditTimestamp).toISOString() : 'never';
				if (packageJsonResult.lastModified) {
					if (packageJsonResult.downloaded) {
						logDebug(`[${p.name}] new version released on ${packageJsonResult.lastModified}, downloading...`);
					} else {
						logDebug(`[${p.name}] last updated ${packageJsonResult.lastModified}, using cached files`);
					}
				}

				tempDirs.set(p.id, tempDir);
				logDebug(`Processed files for ${p.name} successfully`);
			} catch (err) {
				failedDownloadCount++;
				logDebug(`Failed to download for ${p.name}: ${err.message}`);
			}

			downloaded++;
			modal.updateProgress(15 + (downloaded / totalPlugins) * 40, `Downloaded ${downloaded}/${totalPlugins} plugin files`);
		}

		// Update manifest with timestamps and save
		const now = Date.now();
		for (const p of installedManifest) {
			p.lastUpdated = now;
		}
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
				logContent += `=== ${p.name} (${p.id}) ===\nError: Files not downloaded\n\n`;
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
							if (auditResult.vulnerabilities) {
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
				if (incomplete) auditIncompleteCount++;

				if (maxSeverity === 'critical') criticalCount++;
				else if (maxSeverity === 'high') highCount++;
				else if (maxSeverity === 'moderate') moderateCount++;
				else if (maxSeverity === 'low') lowCount++;
				else if (maxSeverity === 'info') infoCount++;
				else noIssuesCount++;

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

async function getDefaultBranch(repo: string, plugin?: PluginManifestEntry): Promise<string> {
	return new Promise((resolve, reject) => {
		const req = https.get(`https://api.github.com/repos/${repo}`, { headers: { 'User-Agent': 'obsidian-security-audit' } }, (res) => {
			if (res.statusCode === 404) {
				reject(new Error('Repository not found'));
				return;
			}
			let data = '';
			res.on('data', chunk => data += chunk);
			res.on('end', () => {
				try {
					const repoData = JSON.parse(data);
					if (plugin) {
						plugin.supportLink = `https://github.com/${repo}/issues`;
					}
					resolve(repoData.default_branch);
				} catch (err) {
					reject(err);
				}
			});
		});
		req.on('error', reject);
	});
}

async function loadCacheMetadata(cacheDir: string, logDebug: (msg: string) => void): Promise<CacheMetadata> {
	const metadataPath = path.join(cacheDir, 'cache-metadata.json');
	logDebug('Loading cache metadata');
	try {
		const content = await fs.readFile(metadataPath, 'utf-8');
		return JSON.parse(content);
	} catch (err) {
		return {};
	}
}

async function saveCacheMetadata(cacheDir: string, metadata: CacheMetadata, logDebug: (msg: string) => void): Promise<void> {
	const metadataPath = path.join(cacheDir, 'cache-metadata.json');
	logDebug('Saving cache metadata');
	await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
}

async function checkLastModified(url: string): Promise<{ lastModified?: string; size?: number }> {
	return new Promise((resolve, reject) => {
		const req = https.request(url, { method: 'HEAD' }, (res) => {
			if (res.statusCode === 404) {
				resolve({});
				return;
			}
			const lastModified = res.headers['last-modified'];
			const contentLength = res.headers['content-length'];
			resolve({
				lastModified: typeof lastModified === 'string' ? lastModified : undefined,
				size: contentLength ? parseInt(contentLength, 10) : undefined
			});
		});
		req.on('error', reject);
		req.end();
	});
}

async function downloadFileWithMetadata(url: string, dest: string, cacheDir: string, relativePath: string, logDebug: (msg: string) => void): Promise<{ downloaded: boolean; lastModified?: string; size?: number }> {
	const metadata = await loadCacheMetadata(cacheDir, logDebug);
	const cached = metadata[relativePath];

	// Check if we need to download
	const remoteInfo = await checkLastModified(url);
	if (!remoteInfo.lastModified) {
		// File not found, don't download
		return { downloaded: false };
	}

	const needsDownload = !cached?.lastModified || cached.lastModified !== remoteInfo.lastModified;

	if (!needsDownload) {
		return { downloaded: false, lastModified: cached.lastModified, size: cached.size };
	}

	// Download the file
	await downloadFile(url, dest);

	// Update metadata
	metadata[relativePath] = {
		lastModified: remoteInfo.lastModified,
		size: remoteInfo.size
	};
	await saveCacheMetadata(cacheDir, metadata, logDebug);

	return { downloaded: true, lastModified: remoteInfo.lastModified, size: remoteInfo.size };
}

async function downloadFile(url: string, dest: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const file = fsSync.createWriteStream(dest);
		const req = https.get(url, (res) => {
			if (res.statusCode === 404) {
				reject(new Error('File not found'));
				return;
			}
			res.pipe(file);
			file.on('finish', () => {
				file.close();
				resolve();
			});
		});
		req.on('error', (err) => {
			fsSync.unlink(dest, () => {}); // Delete the file async
			reject(err);
		});
	});
}

async function downloadManifestWithCache(cacheDir: string, lastAuditTimestamp: number | undefined, logDebug: (msg: string) => void): Promise<PluginManifestEntry[]> {
	const manifestUrl = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json';
	const manifestPath = path.join(cacheDir, 'community-plugins.json');
	const relativePath = 'community-plugins.json';

	const result = await downloadFileWithMetadata(manifestUrl, manifestPath, cacheDir, relativePath, logDebug);

	if (!result.lastModified) {
		throw new Error('Manifest not found');
	}

	// Check if we need to download based on timestamp
	const needsDownload = !lastAuditTimestamp || !result.lastModified || new Date(result.lastModified).getTime() > lastAuditTimestamp;

	if (!needsDownload) {
		logDebug(`Manifest last modified ${result.lastModified}, audit last run ${new Date(lastAuditTimestamp).toISOString()}, using cached manifest`);
		const cachedContent = await fs.readFile(manifestPath, 'utf-8');
		return JSON.parse(cachedContent);
	}

	logDebug(`Manifest last modified ${result.lastModified}, audit last run ${lastAuditTimestamp ? new Date(lastAuditTimestamp).toISOString() : 'never'}, downloading updated manifest`);
	logDebug(`Downloading manifest from ${manifestUrl}`);

	// Download fresh
	return new Promise((resolve, reject) => {
		const req = https.get(manifestUrl, (res: IncomingMessage) => {
			let data = '';
			res.on('data', (chunk: Buffer) => data += chunk);
			res.on('end', () => {
				try {
					const manifest = JSON.parse(data);
					logDebug(`Parsed manifest with ${manifest.length} plugins`);
					// Save to cache
					fs.writeFile(manifestPath, data);
					resolve(manifest);
				} catch (err) {
					reject(err);
				}
			});
		});
		req.on('error', reject);
	});
}

async function downloadManifest(): Promise<PluginManifestEntry[]> {
	return new Promise((resolve, reject) => {
		const req = https.get('https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json', (res: IncomingMessage) => {
			let data = '';
			res.on('data', (chunk: Buffer) => data += chunk);
			res.on('end', () => {
				try {
					resolve(JSON.parse(data));
				} catch (err) {
					reject(err);
				}
			});
		});
		req.on('error', reject);
	});
}