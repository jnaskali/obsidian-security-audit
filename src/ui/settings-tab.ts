import { App, PluginSettingTab, Setting } from 'obsidian';
import SecurityAudit from '../main';

export class SecurityAuditSettingTab extends PluginSettingTab {
	plugin: SecurityAudit;

	constructor(app: App, plugin: SecurityAudit) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h3', {text: 'Debug options'});

		new Setting(containerEl)
			.setName('Debug logging to console')
			.setDesc('Enable console logging with full directory paths for debugging')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugLogging)
				.onChange(async (value) => {
					this.plugin.settings.debugLogging = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Do not delete cache when disabling the plugin')
			.setDesc('Keep the cache directory intact when the plugin is disabled')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.doNotDeleteCacheOnDisable)
				.onChange(async (value) => {
					this.plugin.settings.doNotDeleteCacheOnDisable = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show debug options in menu')
			.setDesc('Show reload plugin and clear cache options in the status bar menu')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showDebugOptionsInMenu)
				.onChange(async (value) => {
					this.plugin.settings.showDebugOptionsInMenu = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Clear cache')
			.setDesc('Clear the plugin cache directory')
			.addButton(button => button
				.setButtonText('Clear cache')
				.setCta()
				.onClick(async () => {
					await this.plugin.clearCache();
				}));
	}
}