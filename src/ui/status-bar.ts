import SecurityAudit from '../main';
import { InstalledPluginsModal, LatestAuditModal } from './modals';
import { runSecurityAudit } from '../commands/run-security-audit';

export function setupStatusBar(plugin: SecurityAudit) {
	// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
	const statusBarItemEl = plugin.addStatusBarItem();
	plugin.statusBarItemEl = statusBarItemEl;
	// Show a simplified white shield SVG icon in the status bar and add a tooltip for accessibility
	// Use an inline SVG so the icon is crisp and styled consistently with the UI.
	statusBarItemEl.setText('');
	statusBarItemEl.innerHTML = `
		<svg role="img" aria-hidden="false" focusable="false" viewBox="0 0 24 24"
			width="14" height="14"
			style="display:inline-block;vertical-align:middle;color:#ffffff;fill:currentColor"
			xmlns="http://www.w3.org/2000/svg">
			<path d="M12 2l7 3v5c0 5-3.5 9.7-7 11-3.5-1.3-7-6-7-11V5l7-3z"/>
		</svg>
	`;
	statusBarItemEl.setAttribute('title', 'Security audit initialized');
	statusBarItemEl.setAttribute('aria-label', 'Security audit');

	// Hover effect: subtle background and cursor change
	plugin.registerDomEvent(statusBarItemEl, 'mouseenter', () => {
		statusBarItemEl.style.background = 'rgba(255,255,255,0.08)';
		statusBarItemEl.style.borderRadius = '4px';
		statusBarItemEl.style.cursor = 'pointer';
	});
	plugin.registerDomEvent(statusBarItemEl, 'mouseleave', () => {
		statusBarItemEl.style.background = '';
		statusBarItemEl.style.borderRadius = '';
		statusBarItemEl.style.cursor = '';
	});

	// Click opens a small menu anchored to the status bar icon
	plugin.registerDomEvent(statusBarItemEl, 'click', (evt: MouseEvent) => {
		evt.stopPropagation();
		if (plugin.statusMenuEl) {
			closeStatusMenu(plugin);
		} else {
			openStatusMenu(plugin);
		}
	});

	// Close menu when clicking elsewhere
	plugin.registerDomEvent(document, 'click', () => {
		if (plugin.statusMenuEl) closeStatusMenu(plugin);
	});
}

export function openStatusMenu(plugin: SecurityAudit) {
	if (!plugin.statusBarItemEl) return;
	plugin.statusMenuEl = document.createElement('div');
	const menu = plugin.statusMenuEl;
	menu.className = 'security-audit-status-menu';

	// position near the status bar item (initial placement — will adjust after measuring)
	const rect = plugin.statusBarItemEl.getBoundingClientRect();
	const initialTop = window.scrollY + rect.top - 8 - 48; // try to place above the bar with small offset
	const initialLeft = window.scrollX + rect.left;
	menu.style.left = `${initialLeft}px`;
	menu.style.top = `${initialTop}px`;

	// Prevent clicks inside the menu from closing it
	menu.addEventListener('click', (e) => e.stopPropagation());

	// Menu item: Run security audit
	const runItem = document.createElement('div');
	runItem.className = 'security-audit-status-menu-item';
	runItem.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" style="fill: white; margin-right: 8px; vertical-align: middle;"><path d="M8 5v14l11-7z"/></svg>Run security audit`;
	runItem.tabIndex = 0;
	runItem.addEventListener('mouseenter', () => runItem.style.background = 'var(--background-modifier-hover)');
	runItem.addEventListener('mouseleave', () => runItem.style.background = '');
	runItem.addEventListener('click', () => {
		// Run the audit directly
		runSecurityAudit(plugin);
		closeStatusMenu(plugin);
	});
	menu.appendChild(runItem);

	// Menu item: Show plugin manifest
	const manifestItem = document.createElement('div');
	manifestItem.className = 'security-audit-status-menu-item';
	manifestItem.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" style="fill: white; margin-right: 8px; vertical-align: middle;"><path d="M3 13h2v-2H3v2zm0-4h2V7H3v2zm0-4h2V3H3v2zm4 0h14V3H7v2zm0 4h14V7H7v2zm0 4h14v-2H7v2z"/></svg>Show installed plugins`;
	manifestItem.tabIndex = 0;
	manifestItem.addEventListener('mouseenter', () => manifestItem.style.background = 'var(--background-modifier-hover)');
	manifestItem.addEventListener('mouseleave', () => manifestItem.style.background = '');
	manifestItem.addEventListener('click', () => {
		closeStatusMenu(plugin);
		new InstalledPluginsModal(plugin.app, plugin).open();
	});
	menu.appendChild(manifestItem);

	// Menu item: Open latest audit
	const latestAuditItem = document.createElement('div');
	latestAuditItem.className = 'security-audit-status-menu-item';
	latestAuditItem.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" style="fill: white; margin-right: 8px; vertical-align: middle;"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>Open latest audit`;
	latestAuditItem.tabIndex = 0;
	latestAuditItem.addEventListener('mouseenter', () => latestAuditItem.style.background = 'var(--background-modifier-hover)');
	latestAuditItem.addEventListener('mouseleave', () => latestAuditItem.style.background = '');
	latestAuditItem.addEventListener('click', () => {
		closeStatusMenu(plugin);
		new LatestAuditModal(plugin.app, plugin, plugin.settings.lastAuditSummary, plugin.settings.lastAuditLog).open();
	});
	menu.appendChild(latestAuditItem);

	if (plugin.settings.showDebugOptionsInMenu) {
		// Menu item: Reload plugin
		const reloadItem = document.createElement('div');
		reloadItem.className = 'security-audit-status-menu-item';
		reloadItem.textContent = 'Reload plugin';
		reloadItem.tabIndex = 0;
		reloadItem.addEventListener('mouseenter', () => reloadItem.style.background = 'var(--background-modifier-hover)');
		reloadItem.addEventListener('mouseleave', () => reloadItem.style.background = '');
		reloadItem.addEventListener('click', () => {
			closeStatusMenu(plugin);
			(plugin.app as any).plugins.disablePlugin(plugin.manifest.id).then(() => {
				(plugin.app as any).plugins.enablePlugin(plugin.manifest.id);
			});
		});
		menu.appendChild(reloadItem);

		// Menu item: Settings
		const openSettingsItem = document.createElement('div');
		openSettingsItem.className = 'security-audit-status-menu-item';
		openSettingsItem.textContent = 'Settings';
		openSettingsItem.tabIndex = 0;
		openSettingsItem.addEventListener('mouseenter', () => openSettingsItem.style.background = 'var(--background-modifier-hover)');
		openSettingsItem.addEventListener('mouseleave', () => openSettingsItem.style.background = '');
		openSettingsItem.addEventListener('click', () => {
			closeStatusMenu(plugin);
			(plugin.app as any).setting.open();
			(plugin.app as any).setting.openTabById(plugin.manifest.id);
		});
		menu.appendChild(openSettingsItem);

		// Menu item: Clear cache
		const clearCacheItem = document.createElement('div');
		clearCacheItem.className = 'security-audit-status-menu-item';
		clearCacheItem.textContent = 'Clear cache';
		clearCacheItem.tabIndex = 0;
		clearCacheItem.addEventListener('mouseenter', () => clearCacheItem.style.background = 'var(--background-modifier-hover)');
		clearCacheItem.addEventListener('mouseleave', () => clearCacheItem.style.background = '');
		clearCacheItem.addEventListener('click', async () => {
			closeStatusMenu(plugin);
			await plugin.clearCache();
		});
		menu.appendChild(clearCacheItem);
	}

	// Append first so we can measure and then adjust to keep inside viewport
	document.body.appendChild(menu);

	// Measure and adjust
	const margin = 8;
	const menuRect = menu.getBoundingClientRect();
	const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
	const viewportHeight = document.documentElement.clientHeight || window.innerHeight;

	// Horizontal adjustment
	if (menuRect.right > viewportWidth - margin) {
		const overflowX = menuRect.right - (viewportWidth - margin);
		const newLeft = Math.max(margin, initialLeft - overflowX);
		menu.style.left = `${newLeft}px`;
	}
	if (menuRect.left < margin) {
		menu.style.left = `${margin}px`;
	}

	// Vertical adjustment: if it doesn't fit above, place below the icon
	const updatedRect = menu.getBoundingClientRect();
	if (updatedRect.top < margin) {
		const belowTop = window.scrollY + rect.bottom + 8;
		menu.style.top = `${belowTop}px`;
	}

	// Re-check bottom overflow and nudge up if necessary (use current absolute top)
	const finalRect = menu.getBoundingClientRect();
	if (finalRect.bottom > viewportHeight - margin) {
		const overflowY = finalRect.bottom - (viewportHeight - margin);
		const currentTop = parseFloat(menu.style.top) || (window.scrollY + finalRect.top);
		const newTop = Math.max(margin, currentTop - overflowY);
		menu.style.top = `${newTop}px`;
	}

	// small entrance animation
	menu.style.opacity = '0';
	menu.style.transform = 'translateY(4px)';
	requestAnimationFrame(() => {
		menu.style.transition = 'opacity 120ms ease, transform 120ms ease';
		menu.style.opacity = '1';
		menu.style.transform = 'translateY(0)';
	});
}

export function closeStatusMenu(plugin: SecurityAudit) {
	if (!plugin.statusMenuEl) return;
	const menu = plugin.statusMenuEl;
	menu.style.transition = 'opacity 120ms ease, transform 120ms ease';
	menu.style.opacity = '0';
	menu.style.transform = 'translateY(4px)';
	setTimeout(() => {
		if (menu.parentElement) menu.parentElement.removeChild(menu);
	}, 150);
	plugin.statusMenuEl = null;
}