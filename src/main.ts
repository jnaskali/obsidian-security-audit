import { App, Editor, MarkdownView, Plugin, FileSystemAdapter } from 'obsidian';
import { SecurityAuditSettings } from './types';
import { DEFAULT_SETTINGS } from './settings';
import { setupStatusBar } from './ui/status-bar';
import { SecurityAuditSettingTab } from './ui/settings-tab';
import { runSecurityAudit } from './commands/run-security-audit';
import { promises as fs } from 'fs';
import * as path from 'path';

export default class SecurityAudit extends Plugin {
	settings: SecurityAuditSettings;

	statusBarItemEl: HTMLElement | null = null;
	statusMenuEl: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		// Create cache directories
		const cacheDir = this.getCacheDir();
		await fs.mkdir(cacheDir, { recursive: true });

		setupStatusBar(this);

		this.addCommand({
			id: 'run-security-audit',
			name: 'Run security audit',
			callback: async () => {
				await runSecurityAudit(this);
			}
		});

		this.addSettingTab(new SecurityAuditSettingTab(this.app, this));
	}

	async onunload() {
		// Delete cache directory unless disabled in settings
		if (!this.settings.doNotDeleteCacheOnDisable) {
			const cacheDir = this.getCacheDir();
			try {
				await fs.rm(cacheDir, { recursive: true, force: true });
			} catch (err) {
				// Ignore if doesn't exist
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	getVaultPath(): string {
		return (this.app.vault.adapter as any).basePath;
	}

	getCacheDir(): string {
		return path.join(this.getVaultPath(), '.obsidian', 'plugins', this.manifest.id, 'cache');
	}

	async clearCache() {
		const cacheDir = this.getCacheDir();
		try {
			await fs.rm(cacheDir, { recursive: true, force: true });
			await fs.mkdir(cacheDir, { recursive: true });
		} catch (err) {
			// Ignore if doesn't exist
		}
	}

}
