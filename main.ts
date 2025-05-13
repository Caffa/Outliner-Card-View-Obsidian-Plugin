import { App, Plugin, PluginSettingTab, Setting, MarkdownView, Notice, Modal, TFile, WorkspaceLeaf, EditorPosition, ItemView } from 'obsidian';

interface OutlinerCardViewSettings {
    defaultIndentationLevel: number;
    cardViewPosition: 'right' | 'left' | 'bottom';
    showCardTitle: boolean;
    allowEditing: boolean;
    showCardNavigation: boolean;
    cardTransitionAnimation: boolean;
    showHoverButtons: boolean;
}

const DEFAULT_SETTINGS: OutlinerCardViewSettings = {
    defaultIndentationLevel: 2,
    cardViewPosition: 'right',
    showCardTitle: true,
    allowEditing: true,
    showCardNavigation: true,
    cardTransitionAnimation: true,
    showHoverButtons: true
}

interface BulletPoint {
    text: string;
    level: number;
    children: BulletPoint[];
    lineStart: number;
    lineEnd: number;
}

export default class OutlinerCardViewPlugin extends Plugin {
    settings: OutlinerCardViewSettings;
    private activeEditor: MarkdownView | null = null;
    private activeLeafChange: any = null;
    private currentHoverIcon: HTMLElement | null = null;
    private currentHoverLineId: string | null = null;

    async onload() {
        await this.loadSettings();
        console.log('Loading Outliner Card View Plugin');

        // Register view type
        this.registerView(
            'outliner-card-view',
            (leaf) => new CardView(leaf, this)
        );

        // Register CSS classes for bullet hover icons
        this.registerDomEvent(document, 'mouseover', (evt: MouseEvent) => {
            if (!this.settings.showHoverButtons) return;

            const target = evt.target as HTMLElement;
            const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!markdownView) return;

            const editor = markdownView.editor;
            const cmEditor = (editor as any).cm; // Access CodeMirror instance
            if (!cmEditor) return;

            const lineElement = target.closest('.cm-line') as HTMLElement;
            if (!lineElement) {
                // If not hovering over a line, do nothing specific here, mouseout will handle cleanup
                return;
            }

            const lineText = lineElement.textContent || '';
            const bulletMatch = lineText.match(/^(\s*)(-|\*|\d+\.)\s/);
            if (!bulletMatch) {
                 // If not a bullet line, do nothing specific here, mouseout will handle cleanup
                return;
            }

            let lineId = lineElement.id;
            if (!lineId) {
                lineId = `outliner-line-${Math.random().toString(36).substr(2, 9)}`;
                lineElement.id = lineId;
            }

            // If icon is already shown for this line, do nothing
            if (this.currentHoverIcon && this.currentHoverLineId === lineId) {
                return;
            }

            // Remove previous icon if it exists and is for a different line
            if (this.currentHoverIcon && this.currentHoverLineId !== lineId) {
                this.currentHoverIcon.remove();
                this.currentHoverIcon = null;
                this.currentHoverLineId = null;
            }

            // Check if an icon for this specific line already exists (e.g. from a quick mouse re-entry)
            // This check is secondary to currentHoverIcon logic but good for robustness
            const existingIconForLine = document.querySelector(`.outliner-bullet-hover-container[data-line-id="${lineId}"]`);
            if (existingIconForLine) {
                this.currentHoverIcon = existingIconForLine as HTMLElement;
                this.currentHoverLineId = lineId;
                return;
            }

            const indentText = bulletMatch[1];
            let indentWidth = 0;
            if (cmEditor && typeof cmEditor.defaultCharacterWidth === 'number') {
                indentWidth = indentText.length * cmEditor.defaultCharacterWidth;
            } else {
                const tempSpan = document.createElement('span');
                tempSpan.style.font = window.getComputedStyle(lineElement).font;
                tempSpan.style.visibility = 'hidden';
                tempSpan.style.position = 'absolute';
                tempSpan.style.whiteSpace = 'pre';
                tempSpan.textContent = indentText;
                document.body.appendChild(tempSpan);
                indentWidth = tempSpan.getBoundingClientRect().width;
                document.body.removeChild(tempSpan);
            }

            const level = Math.floor(indentText.length / (cmEditor.options?.indentUnit || 2)) + 1; // Use indentUnit if available

            const iconContainer = document.createElement('div');
            iconContainer.className = 'outliner-bullet-hover-container';
            iconContainer.setAttribute('data-line-id', lineId);
            iconContainer.setAttribute('data-indent-width', indentWidth.toString()); // Store for scroll handler

            const hoverIcon = document.createElement('span');
            hoverIcon.className = 'outliner-bullet-hover-icon';
            hoverIcon.textContent = '🔍';
            hoverIcon.setAttribute('data-level', level.toString());
            hoverIcon.title = `View as cards (level ${level})`;

            hoverIcon.addEventListener('click', (clickEvt) => {
                clickEvt.preventDefault();
                clickEvt.stopPropagation();
                this.settings.defaultIndentationLevel = level;
                this.saveSettings();
                this.toggleCardView();
                if (this.currentHoverIcon) { // Remove icon after click
                    this.currentHoverIcon.remove();
                    this.currentHoverIcon = null;
                    this.currentHoverLineId = null;
                }
            });

            iconContainer.appendChild(hoverIcon);
            document.body.appendChild(iconContainer);

            const rect = lineElement.getBoundingClientRect();
            const iconWidthEst = 20; // Estimated width of the icon container
            const iconGap = 4;    // Gap between icon and bullet

            iconContainer.style.top = `${rect.top + window.scrollY}px`;
            iconContainer.style.left = `${rect.left + window.scrollX + indentWidth - iconWidthEst - iconGap}px`;

            this.currentHoverIcon = iconContainer;
            this.currentHoverLineId = lineId;
        });

        this.registerDomEvent(document, 'mouseout', (evt: MouseEvent) => {
            if (!this.settings.showHoverButtons || !this.currentHoverIcon) return;

            const relatedTarget = evt.relatedTarget as HTMLElement;

            // Use a small delay to check if the mouse has moved to the corresponding line or icon
            setTimeout(() => {
                if (!this.currentHoverIcon) return; // Icon might have been removed by another event (e.g. click)

                const isMouseOverIcon = this.currentHoverIcon.matches(':hover');
                const lineElement = this.currentHoverLineId ? document.getElementById(this.currentHoverLineId) : null;
                const isMouseOverLine = lineElement ? lineElement.matches(':hover') : false;

                if (!isMouseOverIcon && !isMouseOverLine) {
                    this.currentHoverIcon.remove();
                    this.currentHoverIcon = null;
                    this.currentHoverLineId = null;
                }
            }, 50); // 50ms delay
        });

        // Add a scroll event listener to reposition hover icons when page scrolls
        this.registerDomEvent(document, 'scroll', () => {
            if (!this.currentHoverIcon || !this.currentHoverLineId) return;

            const lineElement = document.getElementById(this.currentHoverLineId);
            if (lineElement && lineElement.closest('.cm-line')) { // Ensure line is still valid
                const rect = lineElement.getBoundingClientRect();
                const indentWidth = parseFloat(this.currentHoverIcon.getAttribute('data-indent-width') || '0');
                const iconWidthEst = 20;
                const iconGap = 4;

                this.currentHoverIcon.style.top = `${rect.top + window.scrollY}px`;
                this.currentHoverIcon.style.left = `${rect.left + window.scrollX + indentWidth - iconWidthEst - iconGap}px`;
            } else {
                // Line not found or no longer valid, remove the icon
                this.currentHoverIcon.remove();
                this.currentHoverIcon = null;
                this.currentHoverLineId = null;
            }
        }, { passive: true });

        // Command to toggle card view
        this.addCommand({
            id: 'toggle-card-view',
            name: 'Toggle Card View',
            callback: () => this.toggleCardView(),
            hotkeys: [
                {
                    modifiers: ["Mod", "Shift"],
                    key: "O"
                }
            ]
        });

        // Command to show next card
        this.addCommand({
            id: 'next-card',
            name: 'Show Next Card',
            callback: () => {
                const cardView = this.getCardView();
                if (cardView) {
                    cardView.navigateToCard(1);
                } else {
                    new Notice('Card view is not active');
                }
            },
            hotkeys: [
                {
                    modifiers: ["Alt"],
                    key: "ArrowRight"
                }
            ]
        });

        // Command to show previous card
        this.addCommand({
            id: 'previous-card',
            name: 'Show Previous Card',
            callback: () => {
                const cardView = this.getCardView();
                if (cardView) {
                    cardView.navigateToCard(-1);
                } else {
                    new Notice('Card view is not active');
                }
            },
            hotkeys: [
                {
                    modifiers: ["Alt"],
                    key: "ArrowLeft"
                }
            ]
        });

        // Listen for changes in the active leaf
        this.activeLeafChange = this.app.workspace.on('active-leaf-change', (leaf) => {
            // Clean up any existing hover icons first
            this.cleanupHoverIcons();

            const view = leaf?.view;
            if (view instanceof MarkdownView) {
                this.activeEditor = view;
                // Update card view when the active editor changes
                const cardView = this.getCardView();
                if (cardView) {
                    this.updateCardView(cardView);
                }
            }
        });

        // Register event reference
        this.registerEvent(this.activeLeafChange);

        // Add settings tab
        this.addSettingTab(new OutlinerCardViewSettingTab(this.app, this));
    }

    /**
     * Clean up any hover icons when unloading
     */
    private cleanupHoverIcons() {
        // Remove any icon currently tracked
        if (this.currentHoverIcon) {
            this.currentHoverIcon.remove();
            this.currentHoverIcon = null;
            this.currentHoverLineId = null;
        }
        // Fallback: remove any other icons that might have been orphaned
        document.querySelectorAll('.outliner-bullet-hover-container').forEach(container => container.remove());
    }

    onunload() {
        // Clean up any hover icons
        this.cleanupHoverIcons();

        // Clean up view
        this.app.workspace.detachLeavesOfType('outliner-card-view');

        // Unregister event if exists
        if (this.activeLeafChange) {
            this.app.workspace.offref(this.activeLeafChange);
            this.activeLeafChange = null;
        }
    }

    private getCardView(): CardView | null {
        const leaves = this.app.workspace.getLeavesOfType('outliner-card-view');
        if (leaves.length === 0) return null;

        const leaf = leaves[0];
        const view = leaf.view;

        if (view instanceof CardView) {
            return view;
        }

        return null;
    }

    /**
     * Toggles the card view overlay
     */
    async toggleCardView() {
        const { workspace } = this.app;

        // Clean up any hover icons
        this.cleanupHoverIcons();

        // Check if the view is already visible
        const leaves = workspace.getLeavesOfType('outliner-card-view');

        if (leaves.length > 0) {
            // If the view is open, close it
            leaves.forEach(leaf => leaf.detach());
            return;
        }

        // If not visible, create and display it
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            new Notice('No active markdown view found.');
            return;
        }

        this.activeEditor = activeView;

        // Create and show overlay directly in the editor
        const overlayEl = document.createElement('div');
        overlayEl.id = 'outliner-card-overlay';
        overlayEl.classList.add('outliner-card-overlay');
        document.body.appendChild(overlayEl);

        // Create the card container within the overlay
        const cardContainer = overlayEl.createEl('div', {
            cls: 'outliner-card-container'
        });

        // Parse the bullet points and create cards
        const editor = this.activeEditor.editor;
        const content = editor.getValue();
        const bulletPoints = this.parseBulletPoints(content);
        const targetLevel = this.settings.defaultIndentationLevel;
        const targetBullets = this.getBulletsAtLevel(bulletPoints, targetLevel);

        if (targetBullets.length === 0) {
            cardContainer.createEl('div', {
                cls: 'outliner-card-empty-state',
                text: 'No bullet points found at the selected indentation level.'
            });

            // Add close button to empty state
            const closeButton = cardContainer.createEl('button', {
                cls: 'outliner-card-navigation-button',
                text: 'Close'
            });
            closeButton.addEventListener('click', () => {
                overlayEl.remove();
            });

            return;
        }

        // Create a simple card view in the overlay
        const cardView = new OverlayCardView(this, overlayEl, cardContainer, targetBullets, this.activeEditor);
        cardView.render();
    }

    /**
     * Updates the card view with content from the active editor
     */
    updateCardView(cardView: CardView) {
        if (!this.activeEditor) return;

        const editor = this.activeEditor.editor;
        const content = editor.getValue();

        // Parse the bullet points from the content
        const bulletPoints = this.parseBulletPoints(content);

        // Find bullets at the target indentation level
        const targetLevel = this.settings.defaultIndentationLevel;
        const targetBullets = this.getBulletsAtLevel(bulletPoints, targetLevel);

        // Update the card view with the target bullets
        cardView.updateCards(targetBullets, this.activeEditor);
    }

    /**
     * Parses bullet points from markdown content
     * @param content The markdown content to parse
     * @returns An array of parsed bullet points
     */
    parseBulletPoints(content: string): BulletPoint[] {
        const lines = content.split('\n');
        const rootBullets: BulletPoint[] = [];
        const stack: BulletPoint[] = [];
        let currentLevel = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Check if this line is a bullet point (starts with -, *, or number followed by period)
            const bulletMatch = line.match(/^(\s*)(-|\*|\d+\.)\s(.*)$/);

            if (bulletMatch) {
                // Calculate indentation level based on leading whitespace
                const indent = bulletMatch[1];
                const level = Math.floor(indent.length / 2) + 1; // Convert spaces to level (2 spaces = 1 level)
                const text = bulletMatch[3].trim();

                const bulletPoint: BulletPoint = {
                    text,
                    level,
                    children: [],
                    lineStart: i,
                    lineEnd: i
                };

                // If it's a sub-bullet of the current bullet
                if (level > currentLevel) {
                    if (stack.length > 0) {
                        // Add as child to the last item in stack
                        stack[stack.length - 1].children.push(bulletPoint);
                    } else {
                        // No parent, add to root
                        rootBullets.push(bulletPoint);
                    }
                    stack.push(bulletPoint);
                }
                // If it's a sibling or higher up in the hierarchy
                else {
                    // Pop from stack until we find the right level
                    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                        stack.pop();
                    }

                    if (stack.length > 0) {
                        // Add as child to the current stack top
                        stack[stack.length - 1].children.push(bulletPoint);
                    } else {
                        // Add to root if no parent
                        rootBullets.push(bulletPoint);
                    }
                    stack.push(bulletPoint);
                }

                currentLevel = level;
            }
            // If not a bullet but a continuation of the current bullet
            else if (stack.length > 0 && line.trim() !== '') {
                // Update the end line of the current bullet
                stack[stack.length - 1].lineEnd = i;
            }
        }

        return rootBullets;
    }

    /**
     * Gets all bullet points at a specific indentation level
     * @param bullets The array of bullet points to search
     * @param targetLevel The target indentation level
     * @returns An array of bullet points at the target level
     */
    getBulletsAtLevel(bullets: BulletPoint[], targetLevel: number): BulletPoint[] {
        const result: BulletPoint[] = [];

        // Recursive function to search through the bullet hierarchy
        const findBulletsAtLevel = (bullet: BulletPoint, currentLevel: number) => {
            if (bullet.level === targetLevel) {
                result.push(bullet);
            } else if (bullet.level < targetLevel) {
                // Continue searching in children
                bullet.children.forEach(child => findBulletsAtLevel(child, currentLevel + 1));
            }
        };

        // Start search from each root bullet
        bullets.forEach(bullet => findBulletsAtLevel(bullet, 1));

        return result;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

/**
 * The card view that displays bullet points as cards
 */
class CardView extends ItemView {
    private plugin: OutlinerCardViewPlugin;
    private cards: BulletPoint[] = [];
    private currentCardIndex: number = 0;
    private activeEditor: MarkdownView | null = null;
    private cardViewContent: HTMLElement;
    private escapeHandler: (evt: KeyboardEvent) => void;

    constructor(leaf: WorkspaceLeaf, plugin: OutlinerCardViewPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.cardViewContent = this.containerEl.createDiv('card-view-content');

        // Create escape key handler
        this.escapeHandler = (evt: KeyboardEvent) => {
            if (evt.key === 'Escape') {
                // Close the card view
                const leaves = this.plugin.app.workspace.getLeavesOfType('outliner-card-view');
                leaves.forEach(leaf => leaf.detach());

                // Focus the main editor
                if (this.activeEditor) {
                    this.activeEditor.leaf.view.setEphemeralState({ focus: true });
                }
            }
        };
    }

    /**
     * Updates the view with new cards
     * @param cards The bullet points to display as cards
     * @param editor The active editor view
     */
    updateCards(cards: BulletPoint[], editor: MarkdownView) {
        this.cards = cards;
        this.activeEditor = editor;
        this.currentCardIndex = 0;
        this.render();
    }

    /**
     * Renders the card view
     */
    render() {
        this.cardViewContent.empty();

        if (this.cards.length === 0) {
            this.cardViewContent.createEl('div', {
                cls: 'outliner-card-empty-state',
                text: 'No bullet points found at the selected indentation level.'
            });
            return;
        }

        // Create the card navigation UI
        this.createNavigationUI(this.cardViewContent);

        // Create the card container
        const cardContainer = this.cardViewContent.createEl('div', {
            cls: 'outliner-card-container'
        });

        // Display the current card
        this.displayCard(cardContainer);
    }

    /**
     * Creates the navigation UI for the cards
     * @param contentEl The content element to add the navigation UI to
     */
    createNavigationUI(contentEl: HTMLElement) {
        const navigationContainer = contentEl.createEl('div', {
            cls: 'outliner-card-navigation'
        });

        // Add navigation info
        const navInfo = navigationContainer.createEl('div', {
            cls: 'outliner-card-navigation-info',
            text: `Card ${this.currentCardIndex + 1} of ${this.cards.length}`
        });

        // Add navigation buttons
        const buttonContainer = navigationContainer.createEl('div', {
            cls: 'outliner-card-navigation-buttons'
        });

        // Home/First card button
        const homeButton = buttonContainer.createEl('button', {
            cls: 'outliner-card-navigation-button outliner-card-navigation-home',
            text: '⏮️ First'
        });
        homeButton.addEventListener('click', () => this.navigateToSpecificCard(0));

        // Previous button
        const prevButton = buttonContainer.createEl('button', {
            cls: 'outliner-card-navigation-button',
            text: '⬅️ Previous'
        });
        prevButton.addEventListener('click', () => this.navigateToCard(-1));

        // Card selector dropdown
        const selectorContainer = buttonContainer.createEl('div', {
            cls: 'outliner-card-selector-container'
        });

        const selector = selectorContainer.createEl('select', {
            cls: 'outliner-card-selector'
        });

        // Add options for each card
        this.cards.forEach((card, index) => {
            const option = selector.createEl('option', {
                value: index.toString(),
                text: card.text
            });

            if (index === this.currentCardIndex) {
                option.selected = true;
            }
        });

        selector.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            const index = parseInt(target.value);
            this.currentCardIndex = index;
            this.render();
        });

        // Next button
        const nextButton = buttonContainer.createEl('button', {
            cls: 'outliner-card-navigation-button',
            text: 'Next ➡️'
        });
        nextButton.addEventListener('click', () => this.navigateToCard(1));

        // Last card button
        const lastButton = buttonContainer.createEl('button', {
            cls: 'outliner-card-navigation-button outliner-card-navigation-last',
            text: 'Last ⏭️'
        });
        lastButton.addEventListener('click', () => this.navigateToSpecificCard(this.cards.length - 1));
    }

    /**
     * Displays the current card
     * @param container The container element to add the card to
     */
    displayCard(container: HTMLElement) {
        const currentCard = this.cards[this.currentCardIndex];
        if (!currentCard) return;

        // Create card title
        if (this.plugin.settings.showCardTitle) {
            const cardTitle = container.createEl('div', {
                cls: 'outliner-card-title',
                text: currentCard.text
            });
        }

        // Create card content
        const cardContent = container.createEl('div', {
            cls: 'outliner-card-content'
        });

        // Display the card's children as a nested list
        this.renderNestedList(cardContent, currentCard.children);

        // Add edit button if editing is allowed
        if (this.plugin.settings.allowEditing && this.activeEditor) {
            const editButton = container.createEl('button', {
                cls: 'outliner-card-edit-button',
                text: 'Edit Card Content'
            });

            editButton.addEventListener('click', () => this.editCardContent(currentCard));
        }

        // Add transition animations if enabled
        if (this.plugin.settings.cardTransitionAnimation) {
            container.addClass('animate');
        }
    }

    /**
     * Renders a nested list of bullet points
     * @param container The container element to add the list to
     * @param bullets The bullet points to render
     */
    renderNestedList(container: HTMLElement, bullets: BulletPoint[]) {
        if (bullets.length === 0) {
            container.createEl('div', {
                cls: 'outliner-card-empty-content',
                text: 'No content'
            });
            return;
        }

        const list = container.createEl('ul', {
            cls: 'outliner-card-list'
        });

        // Render each bullet point
        bullets.forEach(bullet => {
            const listItem = list.createEl('li', {
                cls: 'outliner-card-list-item'
            });

            // Add the bullet text
            listItem.createEl('span', {
                cls: 'outliner-card-list-item-text',
                text: bullet.text
            });

            // Recursively render children if any
            if (bullet.children.length > 0) {
                this.renderNestedList(listItem, bullet.children);
            }
        });
    }

    /**
     * Navigates to another card
     * @param delta The direction to navigate (-1 for previous, 1 for next)
     */
    navigateToCard(delta: number) {
        if (this.cards.length === 0) return;

        // Calculate the new index
        let newIndex = this.currentCardIndex + delta;

        // Wrap around if needed
        if (newIndex < 0) {
            newIndex = this.cards.length - 1;
        } else if (newIndex >= this.cards.length) {
            newIndex = 0;
        }

        this.currentCardIndex = newIndex;
        this.render();
    }

    /**
     * Navigates to a specific card by index
     * @param index The index of the card to navigate to
     */
    navigateToSpecificCard(index: number) {
        if (this.cards.length === 0) return;

        // Ensure the index is valid
        if (index < 0) {
            index = 0;
        } else if (index >= this.cards.length) {
            index = this.cards.length - 1;
        }

        this.currentCardIndex = index;
        this.render();
    }

    /**
     * Opens the editor to edit the card content
     * @param card The card to edit
     */
    editCardContent(card: BulletPoint) {
        if (!this.activeEditor) return;

        const editor = this.activeEditor.editor;

        // Set the cursor to the start of the card content
        const startPos: EditorPosition = {
            line: card.lineStart,
            ch: 0
        };
        const endPos: EditorPosition = {
            line: card.lineEnd,
            ch: editor.getLine(card.lineEnd).length
        };

        // Select the card content and focus the editor
        editor.setSelection(startPos, endPos);
        editor.scrollIntoView({ from: startPos, to: endPos }, true);
        this.activeEditor.leaf.view.setEphemeralState({ focus: true });
    }

    // ItemView required methods
    getViewType(): string {
        return 'outliner-card-view';
    }

    getDisplayText(): string {
        return 'Outliner Card View';
    }

    async onOpen() {
        // Add the escape key handler when the view is opened
        document.addEventListener('keydown', this.escapeHandler);
        this.render();
    }

    async onClose() {
        // Remove the escape key handler when the view is closed
        document.removeEventListener('keydown', this.escapeHandler);
        this.cardViewContent.empty();
    }
}

/**
 * The overlay card view that displays bullet points as cards directly over the editor
 */
class OverlayCardView {
    private plugin: OutlinerCardViewPlugin;
    private overlay: HTMLElement;
    private container: HTMLElement;
    private cards: BulletPoint[] = [];
    private currentCardIndex: number = 0;
    private activeEditor: MarkdownView | null = null;

    constructor(
        plugin: OutlinerCardViewPlugin,
        overlay: HTMLElement,
        container: HTMLElement,
        cards: BulletPoint[],
        editor: MarkdownView
    ) {
        this.plugin = plugin;
        this.overlay = overlay;
        this.container = container;
        this.cards = cards;
        this.activeEditor = editor;

        // Add close on escape key
        document.addEventListener('keydown', this.handleKeydown);

        // Add close on overlay background click (but not card click)
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        // Add close button
        const closeButton = this.container.createEl('button', {
            cls: 'outliner-card-close-button',
            text: 'X'
        });
        closeButton.addEventListener('click', () => this.close());
    }

    /**
     * Handle keyboard events
     */
    private handleKeydown = (evt: KeyboardEvent) => {
        if (evt.key === 'Escape') {
            this.close();
        } else if (evt.key === 'ArrowLeft' && evt.altKey) {
            this.navigateToCard(-1);
            evt.preventDefault();
        } else if (evt.key === 'ArrowRight' && evt.altKey) {
            this.navigateToCard(1);
            evt.preventDefault();
        }
    }

    /**
     * Close the overlay and clean up
     */
    close() {
        document.removeEventListener('keydown', this.handleKeydown);
        this.overlay.remove();
    }

    /**
     * Renders the card view
     */
    render() {
        this.container.empty();

        // Create the card navigation UI
        this.createNavigationUI();

        // Display the current card
        this.displayCard();

        // Add transition animations if enabled
        if (this.plugin.settings.cardTransitionAnimation) {
            this.container.addClass('animate');
        }
    }

    /**
     * Creates the navigation UI for the cards
     */
    createNavigationUI() {
        const navigationContainer = this.container.createEl('div', {
            cls: 'outliner-card-navigation'
        });

        // Create indentation level controls
        const indentationControls = navigationContainer.createEl('div', {
            cls: 'outliner-card-indentation-controls'
        });

        indentationControls.createEl('span', {
            cls: 'outliner-card-indentation-label',
            text: 'Indentation Level: '
        });

        // Decrease indentation button
        const decreaseButton = indentationControls.createEl('button', {
            cls: 'outliner-card-indentation-button',
            text: '−'
        });
        decreaseButton.setAttribute('aria-label', 'Decrease indentation level');
        decreaseButton.addEventListener('click', () => {
            const currentLevel = this.plugin.settings.defaultIndentationLevel;
            if (currentLevel > 1) {
                const newLevel = currentLevel - 1;
                this.plugin.settings.defaultIndentationLevel = newLevel;
                this.plugin.saveSettings();
                this.refreshWithNewIndentationLevel(newLevel);

                // Update the selector to reflect the new value
                const selector = indentationControls.querySelector('.outliner-card-indentation-selector') as HTMLSelectElement;
                if (selector) {
                    selector.value = newLevel.toString();
                }
            }
        });

        // Indentation level selector
        const indentSelector = indentationControls.createEl('select', {
            cls: 'outliner-card-indentation-selector'
        });

        // Add options for levels 1-5
        for (let i = 1; i <= 5; i++) {
            const option = indentSelector.createEl('option', {
                value: i.toString(),
                text: i.toString()
            });

            if (i === this.plugin.settings.defaultIndentationLevel) {
                option.selected = true;
            }
        }

        // Increase indentation button
        const increaseButton = indentationControls.createEl('button', {
            cls: 'outliner-card-indentation-button',
            text: '+'
        });
        increaseButton.setAttribute('aria-label', 'Increase indentation level');
        increaseButton.addEventListener('click', () => {
            const currentLevel = this.plugin.settings.defaultIndentationLevel;
            if (currentLevel < 5) {
                const newLevel = currentLevel + 1;
                this.plugin.settings.defaultIndentationLevel = newLevel;
                this.plugin.saveSettings();
                this.refreshWithNewIndentationLevel(newLevel);

                // Update the selector to reflect the new value
                const selector = indentationControls.querySelector('.outliner-card-indentation-selector') as HTMLSelectElement;
                if (selector) {
                    selector.value = newLevel.toString();
                }
            }
        });

        // Handle indentation level change
        indentSelector.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            const level = parseInt(target.value);

            // Update settings
            this.plugin.settings.defaultIndentationLevel = level;
            this.plugin.saveSettings();

            // Refresh cards with new indentation level
            this.refreshWithNewIndentationLevel(level);
        });

        // Add navigation info
        navigationContainer.createEl('div', {
            cls: 'outliner-card-navigation-info',
            text: `Card ${this.currentCardIndex + 1} of ${this.cards.length}`
        });

        // Add navigation buttons
        const buttonContainer = navigationContainer.createEl('div', {
            cls: 'outliner-card-navigation-buttons'
        });

        // Home/First card button
        const homeButton = buttonContainer.createEl('button', {
            cls: 'outliner-card-navigation-button outliner-card-navigation-home',
            text: '⏮️ First'
        });
        homeButton.addEventListener('click', () => this.navigateToSpecificCard(0));

        // Previous button
        const prevButton = buttonContainer.createEl('button', {
            cls: 'outliner-card-navigation-button',
            text: '⬅️ Previous'
        });
        prevButton.addEventListener('click', () => this.navigateToCard(-1));

        // Card selector dropdown
        const selectorContainer = buttonContainer.createEl('div', {
            cls: 'outliner-card-selector-container'
        });

        const selector = selectorContainer.createEl('select', {
            cls: 'outliner-card-selector'
        });

        // Add options for each card
        this.cards.forEach((card, index) => {
            const option = selector.createEl('option', {
                value: index.toString(),
                text: card.text
            });

            if (index === this.currentCardIndex) {
                option.selected = true;
            }
        });

        selector.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            const index = parseInt(target.value);
            this.currentCardIndex = index;
            this.render();
        });

        // Next button
        const nextButton = buttonContainer.createEl('button', {
            cls: 'outliner-card-navigation-button',
            text: 'Next ➡️'
        });
        nextButton.addEventListener('click', () => this.navigateToCard(1));

        // Last card button
        const lastButton = buttonContainer.createEl('button', {
            cls: 'outliner-card-navigation-button outliner-card-navigation-last',
            text: 'Last ⏭️'
        });
        lastButton.addEventListener('click', () => this.navigateToSpecificCard(this.cards.length - 1));
    }

    /**
     * Displays the current card
     */
    displayCard() {
        const currentCard = this.cards[this.currentCardIndex];
        if (!currentCard) return;

        const contentContainer = this.container.createEl('div', {
            cls: 'outliner-card-content-container'
        });

        // Create card title
        if (this.plugin.settings.showCardTitle) {
            contentContainer.createEl('div', {
                cls: 'outliner-card-title',
                text: currentCard.text
            });
        }

        // Create card content
        const cardContent = contentContainer.createEl('div', {
            cls: 'outliner-card-content'
        });

        // Display the card's children as a nested list
        this.renderNestedList(cardContent, currentCard.children);

        // Add edit button if editing is allowed
        if (this.plugin.settings.allowEditing && this.activeEditor) {
            const editButton = contentContainer.createEl('button', {
                cls: 'outliner-card-edit-button',
                text: 'Edit Card Content'
            });

            editButton.addEventListener('click', () => this.editCardContent(currentCard));
        }

        // Add action buttons container at the bottom
        const actionButtons = this.container.createEl('div', {
            cls: 'outliner-card-action-buttons'
        });

        // Close button at the bottom
        const closeButton = actionButtons.createEl('button', {
            cls: 'outliner-card-action-button',
            text: 'Close'
        });
        closeButton.addEventListener('click', () => this.close());
    }

    /**
     * Renders a nested list of bullet points
     * @param container The container element to add the list to
     * @param bullets The bullet points to render
     */
    renderNestedList(container: HTMLElement, bullets: BulletPoint[]) {
        if (bullets.length === 0) {
            container.createEl('div', {
                cls: 'outliner-card-empty-content',
                text: 'No content'
            });
            return;
        }

        const list = container.createEl('ul', {
            cls: 'outliner-card-list'
        });

        // Render each bullet point
        bullets.forEach(bullet => {
            const listItem = list.createEl('li', {
                cls: 'outliner-card-list-item'
            });

            // Add the bullet text
            listItem.createEl('span', {
                cls: 'outliner-card-list-item-text',
                text: bullet.text
            });

            // Recursively render children if any
            if (bullet.children.length > 0) {
                this.renderNestedList(listItem, bullet.children);
            }
        });
    }

    /**
     * Navigates to another card
     * @param delta The direction to navigate (-1 for previous, 1 for next)
     */
    navigateToCard(delta: number) {
        if (this.cards.length === 0) return;

        // Calculate the new index
        let newIndex = this.currentCardIndex + delta;

        // Wrap around if needed
        if (newIndex < 0) {
            newIndex = this.cards.length - 1;
        } else if (newIndex >= this.cards.length) {
            newIndex = 0;
        }

        this.currentCardIndex = newIndex;
        this.render();
    }

    /**
     * Navigates to a specific card by index
     * @param index The index of the card to navigate to
     */
    navigateToSpecificCard(index: number) {
        if (this.cards.length === 0) return;

        // Ensure the index is valid
        if (index < 0) {
            index = 0;
        } else if (index >= this.cards.length) {
            index = this.cards.length - 1;
        }

        this.currentCardIndex = index;
        this.render();
    }

    /**
     * Opens the editor to edit the card content
     * @param card The card to edit
     */
    editCardContent(card: BulletPoint) {
        if (!this.activeEditor) return;

        const editor = this.activeEditor.editor;

        // Set the cursor to the start of the card content
        const startPos: EditorPosition = {
            line: card.lineStart,
            ch: 0
        };
        const endPos: EditorPosition = {
            line: card.lineEnd,
            ch: editor.getLine(card.lineEnd).length
        };

        // Select the card content, focus the editor, and close the overlay
        editor.setSelection(startPos, endPos);
        editor.scrollIntoView({ from: startPos, to: endPos }, true);
        this.activeEditor.leaf.view.setEphemeralState({ focus: true });
        this.close();
    }

    /**
     * Refresh the view with a new indentation level
     * @param level The new indentation level
     */
    refreshWithNewIndentationLevel(level: number) {
        if (!this.activeEditor) return;

        const editor = this.activeEditor.editor;
        const content = editor.getValue();

        // Parse the bullet points from the content
        const bulletPoints = this.plugin.parseBulletPoints(content);

        // Find bullets at the new indentation level
        const targetBullets = this.plugin.getBulletsAtLevel(bulletPoints, level);

        // Update the cards
        this.cards = targetBullets;
        this.currentCardIndex = 0;

        // Show empty state if no cards are found
        if (this.cards.length === 0) {
            this.container.empty();
            const emptyState = this.container.createEl('div', {
                cls: 'outliner-card-empty-state',
                text: 'No bullet points found at the selected indentation level.'
            });

            // Add close button to empty state
            const closeButton = this.container.createEl('button', {
                cls: 'outliner-card-navigation-button',
                text: 'Close'
            });
            closeButton.addEventListener('click', () => this.close());
        } else {
            // Render the updated view
            this.render();
        }
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

        // Indentation level setting
        new Setting(containerEl)
            .setName('Default Indentation Level')
            .setDesc('Select which level of bullet points to display as cards (1 = top level)')
            .addSlider(slider => slider
                .setLimits(1, 5, 1)
                .setValue(this.plugin.settings.defaultIndentationLevel)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.defaultIndentationLevel = value;
                    await this.plugin.saveSettings();
                }));

        // Card view position setting
        new Setting(containerEl)
            .setName('Card View Position')
            .setDesc('Choose where to display the card view panel')
            .addDropdown(dropdown => dropdown
                .addOption('right', 'Right Side')
                .addOption('left', 'Left Side')
                .addOption('bottom', 'Bottom')
                .setValue(this.plugin.settings.cardViewPosition)
                .onChange(async (value: 'right' | 'left' | 'bottom') => {
                    this.plugin.settings.cardViewPosition = value;
                    await this.plugin.saveSettings();
                }));

        // Show card title setting
        new Setting(containerEl)
            .setName('Show Card Title')
            .setDesc('Show the bullet point text as the card title')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showCardTitle)
                .onChange(async (value) => {
                    this.plugin.settings.showCardTitle = value;
                    await this.plugin.saveSettings();
                }));

        // Allow editing setting
        new Setting(containerEl)
            .setName('Allow Editing')
            .setDesc('Enable direct editing of card content')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowEditing)
                .onChange(async (value) => {
                    this.plugin.settings.allowEditing = value;
                    await this.plugin.saveSettings();
                }));

        // Show card navigation setting
        new Setting(containerEl)
            .setName('Show Card Navigation')
            .setDesc('Show navigation controls for moving between cards')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showCardNavigation)
                .onChange(async (value) => {
                    this.plugin.settings.showCardNavigation = value;
                    await this.plugin.saveSettings();
                }));

        // Card transition animation setting
        new Setting(containerEl)
            .setName('Card Transition Animation')
            .setDesc('Enable smooth transition animations between cards')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.cardTransitionAnimation)
                .onChange(async (value) => {
                    this.plugin.settings.cardTransitionAnimation = value;
                    await this.plugin.saveSettings();
                }));

        // Show hover buttons setting
        new Setting(containerEl)
            .setName('Show Hover Buttons')
            .setDesc('Show hover icons on bullet points for quick card view access')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showHoverButtons)
                .onChange(async (value) => {
                    this.plugin.settings.showHoverButtons = value;
                    await this.plugin.saveSettings();
                }));
    }
}

