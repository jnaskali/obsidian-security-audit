import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import * as https from 'https';
import { IncomingMessage } from 'http';
import { PluginManifestEntry } from '../types';

/**
 * Updates the repository details for a plugin.
 * @param repo The repository string (e.g., 'user/repo').
 * @param plugin The plugin manifest entry to update.
 * @param logDebug A function for logging debug messages.
 * @param token Optional GitHub access token for API authentication.
 * @returns A promise that resolves to an object containing the default branch and a boolean indicating if the repo was updated.
 */
export async function updateRepoDetails(repo: string, plugin: PluginManifestEntry, logDebug: (msg: string) => void, token?: string): Promise<{ branch: string; repoWasUpdated: boolean }> {
    logDebug(`[${plugin.id}] Fetching repository details for ${repo}`);
    return new Promise((resolve, reject) => {
        const headers: Record<string, string> = { 'User-Agent': 'obsidian-security-audit' };
        if (token) {
            headers['Authorization'] = `token ${token}`;
        }
        const req = https.get(`https://api.github.com/repos/${repo}`, { headers }, (res) => {
            if (res.statusCode === 404) {
                return reject(new Error(`[${plugin.id}] Repository not found at https://api.github.com/repos/${repo}`));
            }
            if (res.statusCode === 403) {
                return reject(new Error(`[${plugin.id}] Repository access forbidden (403) for ${repo}. Consider adding a GitHub access token in settings to increase usage limits.`));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`[${plugin.id}] Failed to fetch repository details for ${repo}. Status code: ${res.statusCode}`));
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const repoData = JSON.parse(data);
                    const lastPushed = repoData.pushed_at ? new Date(repoData.pushed_at).getTime() : 0;
                    const repoWasUpdated = plugin.lastUpdated !== lastPushed;

                    if (repoWasUpdated) {
                        logDebug(`[${plugin.id}] Repository was updated. Old: ${plugin.lastUpdated}, New: ${lastPushed}`);
                        plugin.lastUpdated = lastPushed;
                    } else {
                        logDebug(`[${plugin.id}] Repository not updated. Last push: ${lastPushed}`);
                    }
                    
                    plugin.supportLink = `https://github.com/${repo}/issues`;
                    
                    resolve({ branch: repoData.default_branch, repoWasUpdated });
                } catch (err) {
                    reject(new Error(`[${plugin.id}] Error parsing repository data: ${err.message}`));
                }
            });
        });
        req.on('error', (err) => reject(new Error(`[${plugin.id}] Network error fetching repository details: ${err.message}`)));
    });
}

async function downloadFile(url: string, dest: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const file = fsSync.createWriteStream(dest);
		const req = https.get(url, (res) => {
			if (res.statusCode === 404) {
                fsSync.unlink(dest, () => {}); // Delete empty file on 404
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

/**
 * Downloads a package file (package.json or package-lock.json) for a plugin, if not already cached and current.
 * @param plugin The plugin manifest entry.
 * @param branch The default branch of the repository.
 * @param repoWasUpdated A boolean indicating if the repository was updated.
 * @param cacheDir The cache directory.
 * @param fileName The name of the file to download ('package.json' or 'package-lock.json').
 * @param logDebug A function for logging debug messages.
 * @returns A promise that resolves to an object indicating the download status.
 */
export async function downloadPackageFile(plugin: PluginManifestEntry, branch: string, repoWasUpdated: boolean, cacheDir: string, fileName: 'package.json' | 'package-lock.json', logDebug: (msg: string) => void): Promise<{ downloaded: boolean; cached: boolean; error?: string }> {
    const tempDir = path.join(cacheDir, "packages", plugin.id);
    const filePath = path.join(tempDir, fileName);
    const url = `https://raw.githubusercontent.com/${plugin.repo}/${branch}/${fileName}`;

    // Check if cache exists and is current
    try {
        await fs.access(filePath);
        if (!repoWasUpdated) {
            logDebug(`[${plugin.id}] Using cached ${fileName}.`);
            return { downloaded: false, cached: true };
        }
        logDebug(`[${plugin.id}] Repository updated, re-downloading ${fileName}.`);
    } catch {
        logDebug(`[${plugin.id}] ${fileName} not found in cache, downloading.`);
    }

    logDebug(`[${plugin.id}] Downloading ${fileName} from ${url}`);
    try {
        await downloadFile(url, filePath);
        logDebug(`[${plugin.id}] Successfully downloaded ${fileName}.`);
        return { downloaded: true, cached: false };
    } catch (err) {
        if (err.message === 'File not found') {
            logDebug(`[${plugin.id}] ${fileName} not found in repository.`);
        } else {
            logDebug(`[${plugin.id}] Error downloading ${fileName}: ${err.message}`);
        }
        // Check if cache exists despite download failure
        try {
            await fs.access(filePath);
            logDebug(`[${plugin.id}] Using cached ${fileName} due to download failure.`);
            return { downloaded: false, cached: true };
        } catch {
            return { downloaded: false, cached: false, error: err.message };
        }
    }
}

export async function downloadManifestWithCache(cacheDir: string, lastAuditTimestamp: number | undefined, logDebug: (msg: string) => void): Promise<PluginManifestEntry[]> {
	const manifestUrl = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json';
	const manifestPath = path.join(cacheDir, 'community-plugins.json');

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