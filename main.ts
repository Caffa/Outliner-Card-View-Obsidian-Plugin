import { App, Plugin, PluginSettingTab, Setting, MarkdownView, Notice, Modal, TFile, WorkspaceLeaf, EditorPosition } from 'obsidian';

interface OutlinerCardViewSettings {
    defaultIndentationLevel: number;
    cardViewPosition: 'right' | 'left' | 'bottom';
    showCardTitle: boolean;
    allowEditing: boolean;
    showCardNavigation: boolean;
    cardTransitionAnimation: boolean;
}

const DEFAULT_SETTINGS: OutlinerCardViewSettings = {
    defaultIndentationLevel: 2,
    cardViewPosition: 'right',
    showCardTitle: true,
    allowEditing: true,
    showCardNavigation: true,
    cardTransitionAnimation: true
}

export default class OutlinerCardViewPlugin extends Plugin {
    settings: OutlinerCardViewSettings;
    saveButtonEl: HTMLElement | null = null;
    clipboardButtonEl: HTMLElement | null = null;
    floatingButtonsContainer: HTMLElement | null = null;
    topOfNoteButtonsContainer: HTMLElement | null = null;
    private leafChangeEvent: any = null; // Track the event reference
    floatingCopyContainer: HTMLElement | null = null;
    floatingSaveContainer: HTMLElement | null = null;

    async onload() {
        await this.loadSettings();
        console.log('Loading Outliner Card View Plugin');

        // Command with a hotkey (Cmd/Ctrl+Shift+C)
        this.addCommand({
            id: 'copy-active-editor-content',
            name: 'Copy active editor content to clipboard',
            callback: () => {
                this.OneClickClipboard();
            },
            hotkeys: [
                {
                    modifiers: ["Mod", "Shift"],
                    key: "C"
                }
            ]
        });

        // Command with a hotkey (Cmd/Ctrl+Shift+S) for saving to a file
        this.addCommand({
            id: 'save-active-editor-content',
            name: 'Save active editor content to a file',
            callback: () => {
                this.saveToFile();
            },
            hotkeys: [
                {
                    modifiers: ["Mod", "Shift"],
                    key: "S"
                }
            ]
        });

        // Add buttons based on settings
        this.updateButtonLocations();

        // Add settings tab
        this.addSettingTab(new OutlinerCardViewSettingTab(this.app, this));
    }

    /**
     * Helper method to get file by path more efficiently
     */
    private getFileByPath(path: string): TFile | null {
        const abstractFile = this.app.vault.getAbstractFileByPath(path);
        if (abstractFile instanceof TFile) {
            return abstractFile;
        }
        return null;
    }

    /**
     * Updates button locations based on settings
     */
    updateButtonLocations() {
        // Clear any existing buttons by reference
        if (this.saveButtonEl) {
            this.saveButtonEl.remove();
            this.saveButtonEl = null;
        }

        if (this.clipboardButtonEl) {
            this.clipboardButtonEl.remove();
            this.clipboardButtonEl = null;
        }

        if (this.floatingButtonsContainer) {
            this.floatingButtonsContainer.remove();
            this.floatingButtonsContainer = null;
        }

        if (this.topOfNoteButtonsContainer) {
            this.topOfNoteButtonsContainer.remove();
            this.topOfNoteButtonsContainer = null;
        }

        // Additional cleanup - find and remove any other instances of our buttons
        document.querySelectorAll('.outliner-card-view-floating-container').forEach(el => el.remove());
        document.querySelectorAll('.outliner-card-view-top-note-container').forEach(el => el.remove());

        // Unregister previous leaf change event if exists
        if (this.leafChangeEvent) {
            this.app.workspace.offref(this.leafChangeEvent);
            this.leafChangeEvent = null;
        }

        // Check if we need to create floating buttons
        if (this.settings.copyButtonPosition.startsWith('floating-') ||
            this.settings.saveButtonPosition.startsWith('floating-')) {

            // Create floating copy button if needed
            if (this.settings.copyButtonPosition.startsWith('floating-')) {
                this.createFloatingButton('copy', this.settings.copyButtonPosition);
            }

            // Create floating save button if needed
            if (this.settings.saveButtonPosition.startsWith('floating-')) {
                this.createFloatingButton('save', this.settings.saveButtonPosition);
            }
        }

        // Check if we need a top-of-note container
        if (this.settings.copyButtonPosition === 'top-of-note' ||
            this.settings.saveButtonPosition === 'top-of-note') {
            this.createTopOfNoteContainer();
        }

        this.addButtonsToContainers();
    }

    /**
     * Creates the top-of-note container
     */
    createTopOfNoteContainer() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;

        const contentContainer = activeView.contentEl;
        this.topOfNoteButtonsContainer = contentContainer.createEl('div', {
            cls: 'outliner-card-view-top-note-container'
        });

        // Insert at the beginning of the content
        if (contentContainer.firstChild) {
            contentContainer.insertBefore(this.topOfNoteButtonsContainer, contentContainer.firstChild);
        } else {
            contentContainer.appendChild(this.topOfNoteButtonsContainer);
        }

        // Register event handler to add buttons to new active views
        this.leafChangeEvent = this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                // Remove old container
                if (this.topOfNoteButtonsContainer) {
                    this.topOfNoteButtonsContainer.remove();
                    this.topOfNoteButtonsContainer = null;
                }

                // Also clean up any other instances that might exist
                document.querySelectorAll('.outliner-card-view-top-note-container').forEach(el => el.remove());

                // Create new container in the active view if it's a markdown view
                const newActiveView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (newActiveView && (this.settings.copyButtonPosition === 'top-of-note' ||
                    this.settings.saveButtonPosition === 'top-of-note')) {
                    const contentContainer = newActiveView.contentEl;
                    this.topOfNoteButtonsContainer = contentContainer.createEl('div', {
                        cls: 'outliner-card-view-top-note-container'
                    });

                    // Insert at the beginning of the content
                    if (contentContainer.firstChild) {
                        contentContainer.insertBefore(this.topOfNoteButtonsContainer, contentContainer.firstChild);
                    } else {
                        contentContainer.appendChild(this.topOfNoteButtonsContainer);
                    }

                    // Add buttons to the new container
                    this.addButtonsToContainers();
                }
            })
        );
    }

    /**
     * Creates a floating button container with the appropriate position
     */
    createFloatingButton(type: 'copy' | 'save', position: string) {
        // Create the container
        const container = document.body.createEl('div', {
            cls: `outliner-card-view-floating-container outliner-card-view-${type}-container`
        });

        // Extract position parameters from the setting
        // Format is floating-[left/right]-[top/middle/bottom]
        const [_, horizontal, vertical] = position.split('-');

        // Apply positioning via CSS classes
        container.addClass(`outliner-card-view-${horizontal}`);
        container.addClass(`outliner-card-view-${vertical}`);

        // Add to DOM
        document.body.appendChild(container);

        // Store reference to the container
        if (type === 'copy') {
            this.floatingCopyContainer = container;
        } else {
            this.floatingSaveContainer = container;
        }

        // Add the button to this container
        this.addButtonToContainer(type, container);

        return container;
    }

    /**
     * Add a specific button to a container
     */
    addButtonToContainer(type: 'copy' | 'save', container: HTMLElement) {
        let buttonEl: HTMLElement;

        if (type === 'copy') {
            buttonEl = container.createEl('div', {
                cls: 'outliner-card-view-button',
                attr: { 'aria-label': 'Copy Markdown Content' }
            });

            const icon = buttonEl.createEl('span', {
                cls: 'clipboard-icon',
                text: '📋'
            });

            buttonEl.addEventListener('click', () => {
                this.OneClickClipboard();
                // Visual feedback on click
                buttonEl.classList.add('is-active');
                setTimeout(() => {
                    buttonEl.classList.remove('is-active');
                }, 200);
            });

            this.clipboardButtonEl = buttonEl;
        } else {
            buttonEl = container.createEl('div', {
                cls: 'outliner-card-view-button',
                attr: { 'aria-label': 'Save Markdown Content to File' }
            });

            const icon = buttonEl.createEl('span', {
                cls: 'save-icon',
                text: '💾'
            });

            buttonEl.addEventListener('click', () => {
                this.saveToFile();
            });

            this.saveButtonEl = buttonEl;
        }

        return buttonEl;
    }

    /**
     * Add buttons to the appropriate containers based on settings
     */
    addButtonsToContainers() {
        // Add copy button
        this.addButtonForPosition('copy', this.settings.copyButtonPosition);

        // Add save button
        this.addButtonForPosition('save', this.settings.saveButtonPosition);
    }

    /**
     * Add a button based on its position setting
     */
    addButtonForPosition(type: 'copy' | 'save', position: string) {
        if (position === 'hidden') return;

        if (position === 'ribbon') {
            // Add to ribbon
            const buttonEl = this.addRibbonIcon(
                type === 'copy' ? 'clipboard' : 'save',
                type === 'copy' ? 'Copy Markdown Content' : 'Save Markdown Content to File',
                () => {
                    type === 'copy' ? this.OneClickClipboard() : this.saveToFile();
                }
            );

            buttonEl.addClass(type === 'copy' ? 'outliner-card-view-plugin' : 'outliner-card-view-save-plugin');
            buttonEl.addClass('outliner-card-view-ribbon-button');

            if (type === 'copy') {
                this.clipboardButtonEl = buttonEl;
            } else {
                this.saveButtonEl = buttonEl;
            }
        }
        else if (position === 'top-of-note' && this.topOfNoteButtonsContainer) {
            // Add to top of note
            const buttonEl = this.topOfNoteButtonsContainer.createEl('div', {
                cls: 'outliner-card-view-button',
                attr: { 'aria-label': type === 'copy' ? 'Copy Markdown Content' : 'Save Markdown Content to File' }
            });

            const icon = buttonEl.createEl('span', {
                cls: type === 'copy' ? 'clipboard-icon' : 'save-icon',
                text: type === 'copy' ? '📋' : '💾'
            });

            buttonEl.addEventListener('click', () => {
                type === 'copy' ? this.OneClickClipboard() : this.saveToFile();

                // Visual feedback for copy button
                if (type === 'copy') {
                    buttonEl.classList.add('is-active');
                    setTimeout(() => {
                        buttonEl.classList.remove('is-active');
                    }, 200);
                }
            });

            if (type === 'copy') {
                this.clipboardButtonEl = buttonEl;
            } else {
                this.saveButtonEl = buttonEl;
            }
        }
        // Floating buttons are handled by createFloatingButton
    }

    /**
     * Copies the raw markdown content from the editor.
     * (Optionally, you can add logic here to resolve block references by parsing the markdown and fetching the referenced text.)
     */
    async OneClickClipboard() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            new Notice("No active markdown view found.");
            return;
        }
        const editor = activeView.editor;
        let content = editor.getValue();

        // Remove metadata if the setting is enabled
        if (this.settings.removeMetadata) {
            content = content.replace(/^---\n[\s\S]*?\n---\n/, '');
        }

        // Remove block IDs if the setting is enabled
        if (this.settings.removeBlockIds) {
            content = this.cleanAllBlockIds(content);
        }

        // Process block references
        content = await this.resolveBlockReferences(content);

        // Ensure the list structure with indentation is preserved
        content = this.preserveNestedLists(content);

        await navigator.clipboard.writeText(content);
        new Notice("Copied markdown content to clipboard!");
    }

    /**
     * Saves the processed markdown content to a file
     */
    async saveToFile() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            new Notice("No active markdown view found.");
            return;
        }
        const editor = activeView.editor;
        let content = editor.getValue();

        // Remove metadata if the setting is enabled
        if (this.settings.removeMetadata) {
            content = content.replace(/^---\n[\s\S]*?\n---\n/, '');
        }

        // Remove block IDs if the setting is enabled
        if (this.settings.removeBlockIds) {
            content = this.cleanAllBlockIds(content);
        }

        // Process block references
        content = await this.resolveBlockReferences(content);

        // Ensure the list structure with indentation is preserved
        content = this.preserveNestedLists(content);

        // Get current file name as a suggestion
        const currentFile = activeView.file;
        const fileName = currentFile ? currentFile.name.replace('.md', '') : 'exported-content';
        // Apply prefix to file name
        let suggestedName = `${this.settings.fileNamePrefix}${fileName}.md`;

        // If default save location is set, use it
        let targetPath = this.settings.defaultSaveLocation;

        // If no default path or it's empty, prompt the user
        if (!targetPath) {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = suggestedName;

            // Create a promise to handle the modal response
            const savePathPromise = new Promise<string>((resolve) => {
                const modal = new SaveFileModal(this.app, input, (result) => {
                    resolve(result);
                });
                modal.open();
            });

            targetPath = await savePathPromise;

            // If user cancelled, abort
            if (!targetPath) {
                return;
            }

            // Ensure .md extension
            if (!targetPath.endsWith('.md')) {
                targetPath += '.md';
            }
        }

        try {
            // Check if the file already exists
            const existingFile = this.app.vault.getAbstractFileByPath(targetPath);

            if (existingFile instanceof TFile) {
                // File exists, ask for confirmation
                const confirmPromise = new Promise<boolean>((resolve) => {
                    const modal = new ConfirmationModal(
                        this.app,
                        `The file "${targetPath}" already exists. Do you want to overwrite it?`,
                        (confirmed) => {
                            resolve(confirmed);
                        }
                    );
                    modal.open();
                });

                const shouldOverwrite = await confirmPromise;
                if (!shouldOverwrite) {
                    // User declined to overwrite, abort
                    return;
                }
            }

            // Create or overwrite the file
            await this.app.vault.create(targetPath, content);
            new Notice(`Content saved to ${targetPath}`);

            // Open the saved file if the setting is enabled
            if (this.settings.openNewFile) {
                const savedFile = this.getFileByPath(targetPath);
                if (savedFile) {
                    // Open the file in a new leaf (tab)
                    await this.app.workspace.getLeaf('tab').openFile(savedFile);
                }
            }
        } catch (error) {
            console.error('Failed to save file:', error);
            new Notice('Failed to save file. Check console for details.');
        }
    }

    async resolveBlockReferences(content: string): Promise<string> {
        // Pattern to match ![[file]], ![[file#heading]], or ![[file#^blockId]]
        const embedPattern = /\!\[\[(.*?)(?:#([^\]]+))?\]\]/g;
        let matches = Array.from(content.matchAll(embedPattern));

        // Process in reverse order to avoid position shifts
        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i];
            const fullMatch = match[0];
            const filePath = match[1].trim();
            const hashPart = match[2] ? match[2].trim() : "";

            console.log(`Processing embed: file="${filePath}", hash="${hashPart}"`);

            // Get the target file
            const targetFile = this.app.metadataCache.getFirstLinkpathDest(filePath, "");
            if (!targetFile) {
                console.log(`File not found: "${filePath}"`);
                content = content.slice(0, match.index !== undefined ? match.index : 0) +
                          `[File not found: ${filePath}]` +
                          content.slice(match.index !== undefined ? match.index + fullMatch.length : 0);
                continue;
            }

            // Get file content
            const fileContent = await this.app.vault.read(targetFile);
            const fileCache = this.app.metadataCache.getFileCache(targetFile);

            let replacement: string | null = null;

            // Determine if it's a block reference
            if (hashPart.startsWith("^")) {
                // It's a block reference
                const blockId = hashPart.slice(1);
                console.log(`Found block reference: ^${blockId} in file ${targetFile.path}`);

                // Try to find the block in the cache
                if (fileCache && fileCache.blocks && fileCache.blocks[blockId]) {
                    console.log(`Block found in cache: ${blockId}`);
                    const blockPosition = fileCache.blocks[blockId].position;
                    const fileLines = fileContent.split('\n');
                    replacement = fileLines[blockPosition.start.line];
                    // Clean the block content to remove the ID
                    replacement = this.cleanBlockContent(replacement, blockId);
                } else {
                    // Fallback to regex if cache doesn't have block info
                    console.log(`Block not in cache, using regex: ^${blockId}`);
                    const blockPattern = new RegExp(`(.*?)\\s*\\^${blockId}(?:\\s|$)`, "m");
                    const blockMatch = blockPattern.exec(fileContent);
                    replacement = blockMatch ? blockMatch[1].trim() : null;

                    if (!replacement) {
                        // Try more aggressive pattern match
                        console.log(`Trying aggressive pattern match for block: ^${blockId}`);
                        const lines = fileContent.split('\n');
                        for (const line of lines) {
                            if (line.includes(`^${blockId}`)) {
                                replacement = this.cleanBlockContent(line, blockId);
                                break;
                            }
                        }
                    }
                }

                console.log(`Block reference ${blockId} resolved to: ${replacement}`);
            } else if (hashPart) {
                // It's a heading reference
                const headingText = hashPart;
                console.log(`Found heading reference: ${headingText} in file ${targetFile.path}`);

                if (fileCache && fileCache.headings) {
                    // Find the heading in the cache
                    const heading = fileCache.headings.find(h =>
                        h.heading.toLowerCase() === headingText.toLowerCase());

                    if (heading) {
                        const headingLevel = heading.level;
                        const headingLine = heading.position.start.line;

                        // Find the next heading of same or higher level
                        const fileLines = fileContent.split('\n');
                        let endLine = fileLines.length;

                        for (let lineNum = headingLine + 1; lineNum < fileLines.length; lineNum++) {
                            const line = fileLines[lineNum];
                            const headingMatch = line.match(/^(#{1,6})\s/);
                            if (headingMatch && headingMatch[1].length <= headingLevel) {
                                endLine = lineNum;
                                break;
                            }
                        }

                        // Extract content between heading and next heading (include the heading itself)
                        replacement = fileLines.slice(headingLine, endLine).join('\n').trim();
                    }
                }

                // Fallback to regex if cache doesn't work
                if (!replacement) {
                    replacement = await this.getHeadingContent(filePath, headingText);
                }

                console.log(`Heading reference ${headingText} resolved to: ${replacement?.substring(0, 50)}...`);
            } else {
                // It's a full file embed
                replacement = fileContent;
                console.log(`Full file embed ${filePath} resolved`);
            }

            // Replace the embed with the content or remove it if not found
            if (replacement) {
                // Check if the embed is on its own line
                const beforeEmbed = (match.index !== undefined && match.index > 0) ? content[match.index - 1] : '';
                const afterEmbed = (match.index !== undefined && match.index + fullMatch.length < content.length) ?
                    content[match.index + fullMatch.length] : '';

                // Preserve newlines before and after if they exist
                const preserveLeadingNewline = beforeEmbed === '\n' ? '\n' : '';
                const preserveTrailingNewline = afterEmbed === '\n' ? '\n' : '';

                content = content.slice(0, match.index !== undefined ? match.index : 0) +
                          preserveLeadingNewline + replacement + preserveTrailingNewline +
                          content.slice(match.index !== undefined ? match.index + fullMatch.length : 0);
            } else {
                content = content.slice(0, match.index !== undefined ? match.index : 0) +
                          `[Content not found: ${filePath}${hashPart ? '#' + hashPart : ''}]` +
                          content.slice(match.index !== undefined ? match.index + fullMatch.length : 0);
            }
        }

        return content;
    }

    /**
     * Helper function to clean block content by removing block IDs
     * @param content The block content that may contain a block ID
     * @param blockId The specific blockId to remove (optional)
     * @returns Cleaned content without block IDs
     */
    cleanBlockContent(content: string, blockId?: string): string {
        if (!content) return "";

        // First try to remove the specific block ID if provided
        if (blockId) {
            content = content.replace(new RegExp(`\\^${blockId}\\s*$`), '');
        }

        // Also remove any other block IDs that might be present
        content = content.replace(/\s*\^[a-zA-Z0-9]+\s*$/g, '');

        // Trim only trailing whitespace to preserve indentation
        return content.replace(/\s+$/, '');
    }

    /**
     * Clean all block IDs from content
     */
    cleanAllBlockIds(content: string): string {
        // Split into lines to process each line
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            // Apply block ID cleaning to each line
            lines[i] = this.cleanBlockContent(lines[i]);
        }

        return lines.join('\n');
    }

    /**
     * Preserves the nested list structure in markdown content
     * This fixes issues where indented list items lose their indentation
     * @param content The markdown content to process
     * @returns Processed content with preserved list structure
     */
    preserveNestedLists(content: string): string {
        // First, find all list items and mark their levels
        const lines = content.split('\n');

        // No processing needed for single line
        if (lines.length <= 1) {
            return content;
        }

        // Keep track of list hierarchy
        let currentListLevel = 0;
        let inList = false;
        const listLevels: number[] = new Array(lines.length).fill(0);
        const isListItem: boolean[] = new Array(lines.length).fill(false);

        // First pass: detect all list items and their levels
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check if this line is a list item (starts with - or * or number. followed by space)
            const listItemMatch = line.match(/^([\s]*)(-|\*|\d+\.)\s/);

            if (listItemMatch) {
                // This is a list item
                const indentLevel = listItemMatch[1].length;
                isListItem[i] = true;

                // Determine the list level based on indentation
                if (!inList) {
                    // Start of a new list
                    inList = true;
                    currentListLevel = 1;
                } else if (indentLevel > 0) {
                    // This is a nested list item
                    currentListLevel = Math.floor(indentLevel / 2) + 1;
                }

                listLevels[i] = currentListLevel;

                // Check if the next line is a continuation of this list item
                if (i + 1 < lines.length) {
                    const nextLine = lines[i + 1];
                    const nextLineMatch = nextLine.match(/^([\s]*)(-|\*|\d+\.)\s/);

                    if (!nextLineMatch && nextLine.trim()) {
                        // Next line is not a list item but has content - mark it as a continuation
                        // Check if there's any indentation
                        const indentMatch = nextLine.match(/^([\s]*)/);
                        const nextLineIndent = indentMatch && indentMatch[1] !== undefined ? indentMatch[1].length : 0;

                        // If it's not already properly indented, record that we need to preserve its indentation
                        if (nextLineIndent <= indentLevel) {
                            // This is part of the current list item and needs to maintain proper indentation
                            listLevels[i + 1] = currentListLevel;
                        }
                    }
                }
            } else if (inList && line.trim()) {
                // This is not a list item but has content - could be a continuation or nested content
                const indentMatch = line.match(/^([\s]*)/);
                const indentLevel = indentMatch ? indentMatch[1].length : 0;

                // Preserve existing indentation rather than replacing it
                listLevels[i] = Math.max(1, Math.floor(indentLevel / 2) + 1);
            } else if (!line.trim()) {
                // Empty line, reset list context if we were in a list
                inList = false;
                currentListLevel = 0;
            }
        }

        // Now we have identified all the list items and their levels
        // No need to modify the content as we're preserving the original indentation
        return lines.join('\n');
    }

    // Fetch the entire file content if it's just ![[someFile]] with no # part
    async getFullFileContent(filePath: string): Promise<string | null> {
        const file = this.app.metadataCache.getFirstLinkpathDest(filePath, "");
        if (!file) return null;
        return await this.app.vault.read(file);
    }

    // Capture only the specified block
    async getBlockContent(filePath: string, blockId: string): Promise<string | null> {
        const file = this.app.metadataCache.getFirstLinkpathDest(filePath, "");
        if (!file) return null;
        const fileContent = await this.app.vault.read(file);

        // In Obsidian, block IDs are typically at the end of a line like: "Some text ^blockId"
        // Match any line that contains the block ID
        const blockPattern = new RegExp(`.*\\^${blockId}.*$`, "m");
        const match = blockPattern.exec(fileContent);

        if (!match) return null;

        // Return the line content without the block ID using our cleaning function
        return this.cleanBlockContent(match[0], blockId);
    }

    // Capture heading from matching heading line until the next heading of equal/higher level
    async getHeadingContent(filePath: string, heading: string): Promise<string | null> {
        const file = this.app.metadataCache.getFirstLinkpathDest(filePath, "");
        if (!file) return null;
        const fileContent = await this.app.vault.read(file);

        // Escape special regex characters in heading text
        const safeHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        // First, determine the level of the heading (number of #)
        const headingLevelPattern = new RegExp(`^(#{1,6})\\s+${safeHeading}`, "m");
        const levelMatch = headingLevelPattern.exec(fileContent);
        if (!levelMatch) return null;

        const headingLevel = levelMatch[1].length;

        // Match the heading line and capture until the next heading of same/higher level or EOF
        const headingPattern = new RegExp(
            `^#{${headingLevel}}\\s+${safeHeading}.*?$(\\n[\\s\\S]*?)(?=^#{1,${headingLevel}}\\s|$)`,
            "m"
        );

        const match = headingPattern.exec(fileContent);
        return match ? match[1].trim() : null;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        // Clean up all button elements when plugin is disabled
        document.querySelectorAll('.outliner-card-view-floating-container').forEach(el => el.remove());
        document.querySelectorAll('.outliner-card-view-top-note-container').forEach(el => el.remove());

        // Unregister event if exists
        if (this.leafChangeEvent) {
            this.app.workspace.offref(this.leafChangeEvent);
            this.leafChangeEvent = null;
        }
    }
}

// Custom modal for getting save file path
class SaveFileModal extends Modal {
    result: string;
    inputEl: HTMLInputElement;
    onSubmit: (result: string) => void;

    constructor(app: App, inputEl: HTMLInputElement, onSubmit: (result: string) => void) {
        super(app);
        this.inputEl = inputEl;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Save to file' });

        contentEl.createEl('p', {
            text: 'Enter the file path where you want to save the content:'
        });

        // Add the input element with class instead of inline style
        this.inputEl.addClass('outliner-card-view-modal-input');
        contentEl.appendChild(this.inputEl);
        this.inputEl.focus();

        // Add action buttons with classes instead of inline styles
        const buttonContainer = contentEl.createEl('div', {
            cls: 'outliner-card-view-modal-button-container'
        });

        const saveButton = buttonContainer.createEl('button', { text: 'Save' });
        saveButton.addEventListener('click', () => {
            this.close();
            this.onSubmit(this.inputEl.value);
        });

        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel',
            cls: 'outliner-card-view-modal-cancel-button'
        });
        cancelButton.addEventListener('click', () => {
            this.close();
            this.onSubmit('');
        });

        // Handle Enter key
        this.inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.close();
                this.onSubmit(this.inputEl.value);
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Custom modal for confirming file overwrite
class ConfirmationModal extends Modal {
    message: string;
    onConfirm: (confirmed: boolean) => void;

    constructor(app: App, message: string, onConfirm: (confirmed: boolean) => void) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Confirmation' });

        contentEl.createEl('p', {
            text: this.message
        });

        // Add action buttons
        const buttonContainer = contentEl.createEl('div', {
            cls: 'outliner-card-view-modal-button-container'
        });

        const confirmButton = buttonContainer.createEl('button', { text: 'Overwrite' });
        confirmButton.addEventListener('click', () => {
            this.close();
            this.onConfirm(true);
        });

        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel',
            cls: 'outliner-card-view-modal-cancel-button'
        });
        cancelButton.addEventListener('click', () => {
            this.close();
            this.onConfirm(false);
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class OutlinerCardViewSettingTab extends PluginSettingTab {
    plugin: OutlinerCardViewPlugin;

    constructor(app: App, plugin: OutlinerCardViewPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Settings for Outliner Card View Plugin' });

        // Content settings
        containerEl.createEl('h3', { text: 'Content Settings' });

        new Setting(containerEl)
            .setName('Remove Metadata')
            .setDesc('Remove metadata information (marked by three dashes at the top of the file) when copying markdown content. This includes any front matter such as dates, tags, etc.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.removeMetadata)
                .onChange(async (value) => {
                    this.plugin.settings.removeMetadata = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Remove Block IDs')
            .setDesc('Remove block reference IDs (^blockId) from the exported content.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.removeBlockIds)
                .onChange(async (value) => {
                    this.plugin.settings.removeBlockIds = value;
                    await this.plugin.saveSettings();
                }));

        // Copy button settings
        containerEl.createEl('h3', { text: 'Copy Button Settings' });

        new Setting(containerEl)
            .setName('Copy Button Position')
            .setDesc('Choose where to display the copy button.')
            .addDropdown(dropdown => dropdown
                .addOption('ribbon', 'Left Sidebar')
                .addOption('top-of-note', 'Top of Note')
                .addOption('hidden', 'Hidden')
                .addOption('floating-left-top', 'Floating (Left Top)')
                .addOption('floating-left-middle', 'Floating (Left Middle)')
                .addOption('floating-left-bottom', 'Floating (Left Bottom)')
                .addOption('floating-right-top', 'Floating (Right Top)')
                .addOption('floating-right-middle', 'Floating (Right Middle)')
                .addOption('floating-right-bottom', 'Floating (Right Bottom)')
                .setValue(this.plugin.settings.copyButtonPosition)
                .onChange(async (value) => {
                    this.plugin.settings.copyButtonPosition = value as 'ribbon' | 'top-of-note' | 'hidden' | 'floating-left-top' | 'floating-left-middle' | 'floating-left-bottom' | 'floating-right-top' | 'floating-right-middle' | 'floating-right-bottom';
                    await this.plugin.saveSettings();
                    this.plugin.updateButtonLocations();
                }));

        // Save button settings
        containerEl.createEl('h3', { text: 'Save Button Settings' });

        new Setting(containerEl)
            .setName('Save Button Position')
            .setDesc('Choose where to display the save button.')
            .addDropdown(dropdown => dropdown
                .addOption('ribbon', 'Left Sidebar')
                .addOption('top-of-note', 'Top of Note')
                .addOption('hidden', 'Hidden')
                .addOption('floating-left-top', 'Floating (Left Top)')
                .addOption('floating-left-middle', 'Floating (Left Middle)')
                .addOption('floating-left-bottom', 'Floating (Left Bottom)')
                .addOption('floating-right-top', 'Floating (Right Top)')
                .addOption('floating-right-middle', 'Floating (Right Middle)')
                .addOption('floating-right-bottom', 'Floating (Right Bottom)')
                .setValue(this.plugin.settings.saveButtonPosition)
                .onChange(async (value) => {
                    this.plugin.settings.saveButtonPosition = value as 'ribbon' | 'top-of-note' | 'hidden' | 'floating-left-top' | 'floating-left-middle' | 'floating-left-bottom' | 'floating-right-top' | 'floating-right-middle' | 'floating-right-bottom';
                    await this.plugin.saveSettings();
                    this.plugin.updateButtonLocations();
                }));

        new Setting(containerEl)
            .setName('File Name Prefix')
            .setDesc('Prefix to add to exported file names (e.g., "(Plain) ")')
            .addText(text => text
                .setPlaceholder('(Plain) ')
                .setValue(this.plugin.settings.fileNamePrefix)
                .onChange(async (value) => {
                    this.plugin.settings.fileNamePrefix = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default Save Location')
            .setDesc('Optional: Set a default save location for files. Leave empty to be prompted each time. Example: "exports/"')
            .addText(text => text
                .setPlaceholder('exports/')
                .setValue(this.plugin.settings.defaultSaveLocation)
                .onChange(async (value) => {
                    this.plugin.settings.defaultSaveLocation = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Open After Saving')
            .setDesc('Automatically open newly saved files in Obsidian.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.openNewFile)
                .onChange(async (value) => {
                    this.plugin.settings.openNewFile = value;
                    await this.plugin.saveSettings();
                }));
    }
}

