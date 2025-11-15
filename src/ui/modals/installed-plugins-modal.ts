import { App, Modal } from 'obsidian';
import { PluginManifestEntry } from '../../types';
import { promises as fs } from 'fs';
import * as path from 'path';
import { getMaxSeverity } from './utils';
import { LatestAuditModal } from './latest-audit-modal';

export class InstalledPluginsModal extends Modal {
	private plugin: any;
	constructor(app: App, plugin: any) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.createEl('h3', {text: 'Installed Plugins'});

		// Get cache dir
		const cacheDir = this.plugin.getCacheDir();
		const manifestPath = path.join(cacheDir, 'installed-manifest.json');

		fs.readFile(manifestPath, 'utf-8').then(content => {
			try {
				const plugins: PluginManifestEntry[] = JSON.parse(content);
				if (plugins.length === 0) {
					contentEl.createEl('p', {text: 'No community plugin data. Please run security audit.'});
				} else {
					// Parse audit log for issues
					const pluginIssues = this.parseAuditLog();

					// Sort plugins by issue severity (highest first)
					const severityOrder: Record<string, number> = {
						'Critical': 6,
						'High': 5,
						'Moderate': 4,
						'Low': 3,
						'Info': 2,
						'No issues': 1,
						'Audit failed': 0,
						'Not audited': -1
					};
					plugins.sort((a, b) => {
						const issuesA = pluginIssues.get(a.id) || 'Not audited';
						const issuesB = pluginIssues.get(b.id) || 'Not audited';
						return severityOrder[issuesB] - severityOrder[issuesA];
					});

					const table = contentEl.createEl('table', { cls: 'modal-table' });
					const thead = table.createEl('thead');
					const headerRow = thead.createEl('tr');
					headerRow.createEl('th', {text: 'Plugin name (click for repo)', cls: 'text-left'});
					headerRow.createEl('th', {text: 'Issues', cls: 'text-left'});
					headerRow.createEl('th', {text: 'Last Updated', cls: 'text-left'});

					const tbody = table.createEl('tbody');
					plugins.forEach((p: PluginManifestEntry) => {
						const row = tbody.createEl('tr');
						const nameCell = row.createEl('td');
						nameCell.classList.add('text-left');
						if (p.repo) {
							const link = nameCell.createEl('a', {text: p.name, href: `https://github.com/${p.repo}`});
							link.target = '_blank';
						} else {
							nameCell.textContent = p.name;
						}
						const issues = pluginIssues.get(p.id) || 'Not audited';
						const issuesCell = row.createEl('td', {text: issues, cls: 'text-left'});
						// Color the issues text
						const classMap: Record<string, string> = {
							'Critical': 'security-audit-issue-critical',
							'High': 'security-audit-issue-high',
							'Moderate': 'security-audit-issue-moderate',
							'Low': 'security-audit-issue-low',
							'Info': 'security-audit-issue-info',
							'No issues': 'security-audit-issue-no-issues',
							'Audit failed': 'security-audit-issue-failed',
							'Not audited': 'security-audit-issue-not-audited'
						};
						if (classMap[issues]) {
							issuesCell.addClass(classMap[issues]);
						}
						
						// Add last updated date in YYYY-MM-DD format
						const lastUpdatedCell = row.createEl('td', {cls: 'text-left'});
						if (p.lastUpdated) {
							const lastUpdatedDate = new Date(p.lastUpdated);
							const year = lastUpdatedDate.getFullYear();
							const month = String(lastUpdatedDate.getMonth() + 1).padStart(2, '0');
							const day = String(lastUpdatedDate.getDate()).padStart(2, '0');
							const formattedDate = `${year}-${month}-${day}`;
							lastUpdatedCell.textContent = formattedDate;

							// Color dates older than 1 year in orange
							const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
							if (p.lastUpdated < oneYearAgo) {
								lastUpdatedCell.addClass('security-audit-outdated-date');
							}
						} else {
							lastUpdatedCell.textContent = 'Unknown';
						}
					});

					// Add centered "Open audit report" button
					const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container-centered' });
					const openReportButton = buttonContainer.createEl('button', {text: 'Open audit report', cls: 'modal-button'});
					openReportButton.addEventListener('click', () => {
						this.close();
						new LatestAuditModal(this.app, this.plugin, this.plugin.settings.lastAuditSummary, this.plugin.settings.lastAuditLog).open();
					});
				}
			} catch (err) {
				contentEl.createEl('p', {text: 'Failed to parse installed plugins manifest.'});
			}
		}).catch(err => {
			contentEl.createEl('p', {text: 'Failed to load installed plugins manifest.'});
		});
	}

	private parseAuditLog(): Map<string, string> {
		const pluginIssues = new Map<string, string>();
		if (!this.plugin.settings.lastAuditLog) return pluginIssues;

		const sections = this.plugin.settings.lastAuditLog.split('=== ').filter((s: string) => s.trim());
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
				if (audit.error) {
					pluginIssues.set(id, 'Audit failed');
				} else {
					const vulnerabilities = audit.vulnerabilities || {};
					const {maxSeverity} = getMaxSeverity(vulnerabilities);
					if (maxSeverity === 'none') {
						pluginIssues.set(id, 'No issues');
					} else {
						pluginIssues.set(id, maxSeverity.charAt(0).toUpperCase() + maxSeverity.slice(1));
					}
				}
			} catch (e) {
				// If not JSON, check for error
				if (jsonStr.startsWith('Error:') || jsonStr === 'No repository') {
					pluginIssues.set(id, 'Audit failed');
				}
			}
		}

		return pluginIssues;
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
		if ((this as any).onCancel) {
			(this as any).onCancel();
		}
	}
}