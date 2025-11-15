import { App, Modal } from 'obsidian';
// @ts-ignore
import { shell } from 'electron';
import { createSummaryTable } from './utils';
import { LongTextModal } from './long-text-modal';
import { InstalledPluginsModal } from './installed-plugins-modal';

export class LatestAuditModal extends Modal {
	private summary?: {critical: number, high: number, moderate: number, low: number, info: number, noIssues: number, failedDownload: number, auditIncomplete: number, noRepo: number};
	private logContent?: string;
	private plugin: any;

	constructor(app: App, plugin: any, summary?: any, logContent?: string) {
		super(app);
		this.plugin = plugin;
		this.summary = summary;
		this.logContent = logContent;
	}

	private parseInsecurities(): string {
		if (!this.logContent) return 'No audit log available.';

		const sections = this.logContent.split('=== ').filter(s => s.trim());
		const plugins: {name: string, id: string, maxSeverity: string, libraries: {name: string, severity: string}[]}[] = [];

		const severityOrder: Record<string, number> = { 'critical': 5, 'high': 4, 'moderate': 3, 'low': 2, 'info': 1, 'none': 0 };

		for (const section of sections) {
			const lines = section.split('\n');
			const header = lines[0];
			const match = header.match(/^(.+?)\s*\((.+?)\)\s*===/);
			if (!match) continue;
			const name = match[1];
			const id = match[2];
			const jsonStr = lines.slice(1).join('\n').trim();
			try {
				const audit = JSON.parse(jsonStr);
				const vulnerabilities = audit.vulnerabilities || {};
				let maxSeverity = 'none';
				const libraries: {name: string, severity: string}[] = [];
				for (const [lib, vuln] of Object.entries(vulnerabilities as any)) {
					const sev = (vuln as any).severity;
					libraries.push({name: lib, severity: sev});
					if (severityOrder[sev] > severityOrder[maxSeverity]) {
						maxSeverity = sev;
					}
				}
				if (maxSeverity !== 'none') {
					plugins.push({name, id, maxSeverity, libraries});
				}
			} catch (e) {
				// Skip invalid JSON
			}
		}

		plugins.sort((a, b) => severityOrder[b.maxSeverity] - severityOrder[a.maxSeverity]);

		let text = '';
		for (const plugin of plugins) {
			text += `=== ${plugin.name} (${plugin.id}) ===\n`;
			text += `Highest Severity: ${plugin.maxSeverity}\n`;
			text += 'Insecure Libraries:\n';
			for (const lib of plugin.libraries) {
				text += `  - ${lib.name} (${lib.severity})\n`;
			}
			text += '\n';
		}

		return text || 'No insecurities found.';
	}

	private parseFailures(): string {
		if (!this.logContent) return 'No audit log available.';

		const sections = this.logContent.split('=== ').filter(s => s.trim());
		const failedPlugins: {name: string, id: string, error: string}[] = [];

		for (const section of sections) {
			const lines = section.split('\n');
			const header = lines[0];
			const match = header.match(/^(.+?)\s*\((.+?)\)\s*===/);
			if (!match) continue;
			const name = match[1];
			const id = match[2];
			const content = lines.slice(1).join('\n').trim();
			if (content.startsWith('Error:') || content === 'No repository') {
				const error = content.startsWith('Error:') ? content.replace('Error:', '').trim() : content;
				failedPlugins.push({name, id, error});
			}
		}

		let text = '';
		for (const plugin of failedPlugins) {
			text += `=== ${plugin.name} (${plugin.id}) ===\n`;
			text += `${plugin.error.startsWith('No repository') ? 'No repository' : 'Error: ' + plugin.error}\n\n`;
		}

		return text || 'No failures found.';
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.createEl('h3', {text: 'Security Audit Report'});

		// Add timestamp
		if (this.plugin.settings.lastAuditTimestamp) {
			const timestamp = new Date(this.plugin.settings.lastAuditTimestamp);
			const timestampStr = timestamp.toLocaleString();
			contentEl.createEl('p', {text: `Last audit: ${timestampStr}`, cls: 'audit-timestamp'});
		}

		if (this.summary) {
			const table = createSummaryTable(contentEl, 'Plugin category', 'Plugin count', this.summary);

			const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container' });

			// Add List plugins button
			const listPluginsButton = buttonContainer.createEl('button', {text: 'List plugins', cls: 'modal-button'});
			listPluginsButton.addEventListener('click', () => {
				new InstalledPluginsModal(this.app, this.plugin).open();
			});

			// Add Show insecurities button
			const insecuritiesButton = buttonContainer.createEl('button', {text: 'Show insecurities', cls: 'modal-button'});
			insecuritiesButton.addEventListener('click', () => {
				const insecuritiesText = this.parseInsecurities();
				new LongTextModal(this.app, insecuritiesText).open();
			});

			// Add Show failures button
			const failuresButton = buttonContainer.createEl('button', {text: 'Show failures', cls: 'modal-button'});
			failuresButton.addEventListener('click', () => {
				const failuresText = this.parseFailures();
				new LongTextModal(this.app, failuresText).open();
			});

			if (this.logContent && this.plugin.settings.showDebugOptionsInMenu) {
				const cacheDir = this.plugin.getCacheDir();
				const button = buttonContainer.createEl('button', {text: 'Explore cache', cls: 'modal-button'});
				button.addEventListener('click', () => {
					shell.openPath(cacheDir).then((err: string) => {
						if (err) console.error('Failed to open cache:', err);
					});
				});
			}
		} else {
			contentEl.createEl('p', {text: 'No audit information available.'});
		}
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}