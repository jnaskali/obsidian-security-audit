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
	
		// GitHub access token (no heading to match Obsidian plugin typography)
		new Setting(containerEl)
			.setName('GitHub access token')
			.setDesc('Optional, but GitHub only allows 60 unauthenticated API calls per hour.')
			.addText(text => text
				.setPlaceholder('Personal GitHub token')
				.setValue(this.plugin.settings.githubAccessToken || '')
				.onChange(async (value) => {
					this.plugin.settings.githubAccessToken = value || undefined;
					await this.plugin.saveSettings();
				}));
	
		// Debug options toggle — controls visibility of the debug settings below
		const debugSetting = new Setting(containerEl)
			.setName('Debug options')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugOptions)
				.onChange(async (value) => {
					this.plugin.settings.debugOptions = value;
					// Show or hide debug container
					debugContainer.style.display = value ? '' : 'none';
					await this.plugin.saveSettings();
				}));

		(debugSetting.settingEl.querySelector('.setting-item-name') as HTMLElement)!.style.fontWeight = 'bold';
	
		const debugContainer = containerEl.createDiv({cls: 'security-audit-debug-container'});
	
		// Initial visibility
		debugContainer.style.display = this.plugin.settings.debugOptions ? '' : 'none';
	
		new Setting(debugContainer)
			.setName('Debug logging to console')
			.setDesc('Enable verbose console logging for debugging')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugLogging)
				.onChange(async (value) => {
					this.plugin.settings.debugLogging = value;
					await this.plugin.saveSettings();
				}));
	
		new Setting(debugContainer)
			.setName('Do not delete cache when disabling the plugin')
			.setDesc('Keep the cache directory intact when the plugin is disabled')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.doNotDeleteCacheOnDisable)
				.onChange(async (value) => {
					this.plugin.settings.doNotDeleteCacheOnDisable = value;
					await this.plugin.saveSettings();
				}));
	
		new Setting(debugContainer)
			.setName('Show debug options in menu')
			.setDesc('Show reload plugin, open settings (this screen) and clear cache options in the status bar menu')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showDebugOptionsInMenu)
				.onChange(async (value) => {
					this.plugin.settings.showDebugOptionsInMenu = value;
					await this.plugin.saveSettings();
				}));
	
		new Setting(debugContainer)
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