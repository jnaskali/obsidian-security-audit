import { App, Modal } from 'obsidian';

export class LongTextModal extends Modal {
	private textContent: string;
	constructor(app: App, textContent: string) {
		super(app);
		this.textContent = textContent;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.style.maxHeight = '70vh';
		contentEl.style.overflowY = 'auto';
		const pre = contentEl.createEl('pre', { cls: 'long-text-pre' });
		pre.textContent = this.textContent;
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}