import { App, Editor, MarkdownView, parseFrontMatterEntry, Notice, Plugin, FuzzySuggestModal, SuggestModal, Modal, Setting, getAllTags, TFile } from 'obsidian';
import * as helpers from './helpers';


interface Metadata {
    title: string;
    field: string;
    isNew: boolean;
}

interface InitialChoice {
    title: string;
    subtitle: string;
    type: 'FuzzySuggestModal'|'PromptModal';
    field: 'category'|'tags'|'aliases'|'author'|'year'|'all';
}

const ALL_CHOICES = [
    {
        title: 'Add Category',
        subtitle: 'Choose a category to add',
        type: 'FuzzySuggestModal',
        field: 'category',
    },
    {
        title: 'Add Tag',
        subtitle: 'Choose tag to add',
        type: 'FuzzySuggestModal',
        field: 'tags',
    },
    {
        title: 'Add Alias',
        subtitle: 'Specify an alias to add',
        type: 'PromptModal',
        field: 'aliases',
    },
    {
        title: 'Add Year',
        subtitle: 'Specify year to add',
        type: 'PromptModal',
        field: 'year',
    },
    {
        title: 'Add Author',
        subtitle: 'Choose an author to add',
        type: 'FuzzySuggestModal',
        field: 'author',
    }
]


export class InitialModal extends SuggestModal<InitialChoice> {
    
    constructor(app: App) {
        super(app);
        this.setInstructions([{  
            command: "↑↓",  
            purpose: "Navigate suggestions"  
          }, {  
            command: "↵",  
            purpose: "Select item"  
          }, {  
            command: "⌘ D",
            purpose: "Modify or Delete"
          }, {
            command: "esc",  
            purpose: "Cancel"  
        }]);

        this.scope.register(["Mod"], "d", (evt) => {  
            evt.preventDefault();
            this.close();
            const deletionModal = new DeletionModal(this.app);
            setTimeout(() => deletionModal.open(), 100);
            return false;
        });
    }

    getSuggestions(query: string): InitialChoice[] {
        return ALL_CHOICES.filter((choice) =>
          choice.title.toLowerCase().includes(query.toLowerCase())
        );
      }

    renderSuggestion(choice: InitialChoice, el: HTMLElement) {
        el.createEl('div', { text: choice.title });
        el.createEl('small', { text: choice.subtitle, cls: 'suggestion-subtitle' });
    }

    onChooseSuggestion(choice: InitialChoice, evt: MouseEvent | KeyboardEvent) {
        if (choice.type === 'FuzzySuggestModal') {
            const field = choice.field as 'category'|'tags'|'author';
            const metadataModal = new MetadataModal(this.app, field);
            metadataModal.open();
            metadataModal.setPlaceholder(`Select a ${field} to add`);
        } else if (choice.type === 'PromptModal') {
            const field = choice.field;
            const promptModal = new PromptModal(this.app, field, async (value) => {
                if (value) {
                    if (field === 'year') {
                        value = parseInt(value);
                    }

                    const file = helpers.getActiveMDFile(this.app);
                    if (!file) {new Notice('No active markdown file found'); return; }
                  
                    const existingValues: Metadata[] = helpers.readFrontmatterValuesfromActiveFile(this.app, file, field);
                    if (!existingValues.some(v => v.title.includes(value))) {
                        existingValues.push({ title: value, field: field, isNew: false });
                    }

                    const changed = helpers.updateFrontmatterValues(this.app, file, field, value);
                    if (changed) {
                        new Notice(`Added "${value}" to ${field}`);
                    }
                    this.close();
                    new InitialModal(this.app).open();
                }   
            });
            promptModal.open();
        }
    };        
}

export class PromptModal extends Modal {
    constructor(app: App, field: string, onSubmit: (result: string) => void, initialValue?: string) {
        super(app);
        this.setTitle('Input Value for ' + field);

        let newValue = '';
        let submitBtnRef: any = null;

        const validate = () => {
            const isValid = field === 'year' ? /^\d+$/.test(newValue) : newValue.trim().length > 0;
            if (submitBtnRef) submitBtnRef.setDisabled(!isValid);
        }

        new Setting(this.contentEl)
            .setName(field)
            .addText((text) => {
                // Set initial value if provided
                if (typeof initialValue !== 'undefined' && initialValue !== null) {
                    (text as any).setValue(String(initialValue));
                    newValue = String(initialValue);
                }
                text.onChange((value) => {
                    newValue = value;
                    validate();
                });
                if (field === 'year') {
                    const inputEl = (text as any).inputEl as HTMLInputElement;
                    inputEl.inputMode = 'numeric';
                    inputEl.pattern = '\\d*';
                    // Strip non-digits as the user types and keep the component state in sync
                    inputEl.addEventListener('input', () => {
                        const cleaned = inputEl.value.replace(/\D/g, '');
                        if (cleaned !== inputEl.value) {
                            inputEl.value = cleaned;
                            (text as any).setValue(cleaned);
                        }
                        newValue = cleaned;
                        validate();
                    });
                }
                // Run initial validation after possible initialValue set
                setTimeout(validate, 0);
            });

        new Setting(this.contentEl)
          .addButton((btn) =>
            btn
              .setButtonText('Submit')
              .setCta()
              .onClick(() => {
                this.close();
                onSubmit(newValue);
              })
            )
          .addButton((btn) =>
            btn
              .setButtonText('Cancel')
              .onClick(() => {
                this.close();
              })
              );
      }
}

export class MetadataModal extends FuzzySuggestModal<Metadata> {
    private field: 'category'|'tags'|'author';
    private currentInput: string = '';
    private allowCreate: boolean;
    private presentMetadata: Metadata[] = [];

    constructor(app: App, field: 'category'|'tags'|'author', allowCreate: boolean = true) {  
        super(app);
        this.setInstructions([{  
            command: "↑↓",  
            purpose: "Navigate suggestions"  
            }, {  
            command: "↵",  
            purpose: "Add item"  
            }, {  
            command: "⌘ ↵",  
            purpose: "Add another"  
            }, {  
            command: "esc",  
            purpose: "Cancel"  
        }]);    

        this.scope.register(["Mod"], "Enter", (evt) => {  
            this.selectActiveSuggestion(evt);
            return false;
        });

        this.field = field;
        this.allowCreate = allowCreate;
    }
    
    private getValues(): Metadata[] {
        const file = helpers.getActiveMDFile(this.app);
        if (!file) {new Notice('No active markdown file found'); return; }
        
        //Get values of active note
        this.presentMetadata = helpers.readFrontmatterValuesfromActiveFile(this.app, file, this.field);
        //Get all possible values in vault (excluding present values)
        return helpers.readFrontmatterValuesfromVault(this.app, this.field, this.presentMetadata);
    }

    getSuggestions(query: string | undefined): Metadata[] {
        const raw = (query ?? '').toString();
        this.currentInput = raw.trim();
        const allValues = this.getValues();
        if (!this.currentInput) return allValues;
        
        const inputLower = this.currentInput.toLowerCase();
        const matches = allValues
            .filter(v => typeof v.title === 'string' && v.title.toLowerCase().includes(inputLower))

        //If current input isn't equal to present values, add current input as a new value
        const inActiveNoteExact = Array.from(this.presentMetadata).some(v => v.title.toLowerCase() === inputLower);
        const inActiveNotePrefix = Array.from(this.presentMetadata).some(v => v.title.toLowerCase().startsWith(inputLower));
        this.allowCreate = !(inActiveNoteExact);

        if (matches.length === 0 && this.allowCreate) {
           return [{ title: this.currentInput, field: this.field, isNew: true }];
        }

        // If partial matches and no exact match, put "Create new" first
        const hasExactMatch = matches.some(m =>
            typeof m.title === 'string' && m.title.toLowerCase() === inputLower
        );

        if (!hasExactMatch && this.allowCreate) {
            matches.push({ title: this.currentInput, field: this.field, isNew: true });
        }

        return matches;
    }
    
    getItemText(item: Metadata) { return String(item?.title ?? ''); }

    renderSuggestion(itemOrMatch: any, el: HTMLElement) {
        const item = itemOrMatch?.item ?? itemOrMatch;
        if (item?.isNew) {
            el.createEl('div', { text: `Create new ${this.field}: "${item.title}"` });
            el.addClass('suggestion-new');
        } else {
            el.createEl('div', { text: item.title });
        }
    }

    async onChooseSuggestion(itemOrMatch: any, evt: MouseEvent | KeyboardEvent) {
        const item = itemOrMatch?.item ?? itemOrMatch;
        const file = helpers.getActiveMDFile(this.app);
        if (!file) {new Notice('No active markdown file found'); return; }
      
        const changed = await helpers.updateFrontmatterValues(this.app, file, this.field, item.title);
        if (changed) {
          new Notice(`Added "${item.title}" to ${this.field}`);
        }
        
        if (evt instanceof KeyboardEvent && (evt.ctrlKey || evt.metaKey)) {
            // Reopen modal for another entry
            const newModal = new MetadataModal(this.app, this.field, this.allowCreate);
            setTimeout(() => newModal.open(), 100);
        } else {
            this.close();
            new InitialModal(this.app).open();
        }
    }
}  

export class DeletionModal extends FuzzySuggestModal <Metadata> {
    constructor(app: App) {  
        super(app);  
          
        // Set instructions to show keyboard shortcuts  
        this.setInstructions([{  
          command: "↑↓",  
          purpose: "Navigate"  
        }, {  
          command: "↵",  
          purpose: "Modify item"  
        }, {  
          command: "⌘ ↵",  
          purpose: "Delete item"  
        }, {
          command: "⇧↵",
          purpose: "Modify another"
        }, {
            command: "⇧⌘ ↵",
            purpose: "Delete another"
        }, {
          command: "⌘ A",
          purpose: "Add items"  
        }]);    

        this.scope.register(["Mod"], "a", (evt) => {  
            evt.preventDefault();
            this.close();
            const initialModal = new InitialModal(this.app);
            setTimeout(() => initialModal.open(), 100);
            return false;
        });

        this.scope.register(["Shift", "Mod"], "Enter", (evt) => {  
            this.selectActiveSuggestion(evt);
            return false;
        });

        this.scope.register(["Shift"], "Enter", (evt) => {  
            this.selectActiveSuggestion(evt);
            return false;
        });

        this.scope.register(["Mod"], "Enter", (evt) => {  
            this.selectActiveSuggestion(evt);
            return false;
        });
}  

    async getSuggestions(query: string): Metadata[] {
        const file = helpers.getActiveMDFile(this.app);
        if (!file) {new Notice('No active markdown file found'); return; }
        const metadataChoices = helpers.readFrontmatterValuesfromActiveFile(this.app, file, 'all');
        return metadataChoices.filter((choice) => choice.title.toString().toLowerCase().includes(query.toLowerCase()) || choice.field.toLowerCase().includes(query.toLowerCase()));
    }

    getItemText(item: Metadata): string {return item.title; }

    renderSuggestion(choice: Metadata, el: HTMLElement) {
        el.createEl('div', { text: choice.title, cls: 'suggestion-title' });
        el.createEl('small', { 
            text: choice.field === 'tags'
                ? 'Modify values for tag: ' + choice.title 
                : 'Modify values for ' + choice.field + ': ' + choice.title, 
            cls: 'suggestion-subtitle'
        });
    }

    async onChooseSuggestion(choice: Metadata, evt: MouseEvent | KeyboardEvent) {
        //If meta key held, delete item
        //If meta + shift held, delete and reopen
        //If shift held, modify item and reopen
        if (evt instanceof KeyboardEvent && (evt.ctrlKey || evt.metaKey)) {            
            const file = helpers.getActiveMDFile(this.app);
            if (!file) {new Notice('No active markdown file found'); return; }
            
            const changed = helpers.updateFrontmatterValues(this.app, file, choice.field, choice.title);
            if (changed) { new Notice(`Removed "${choice.title}" from ${choice.field}`); }
            await new Promise(res => setTimeout(res, 100)); // 50-200ms usually enough
            
            // Reopen deletion modal if command + shift held
            if (evt.metaKey && evt.shiftKey) {
                const remainingChoices = await this.getSuggestions('');
                if (remainingChoices.length > 0) {
                    const newModal = new DeletionModal(this.app);
                    setTimeout(() => newModal.open(), 100);
                } else {
                    new Notice('All metadata removed.');
                    this.close();
                }
            } else {
                this.close();
            }
        } else {
            //Modify field if no command held
            const field = choice.field;
            const oldTitle = choice.title;
            this.close();
            const promptModal = new PromptModal(this.app, field, async (value) => {
                if (!value) {
                    new Notice('No value provided, modification cancelled.');
                    const reopen = new DeletionModal(this.app);
                    reopen.open();
                    return;
                }
                // If value unchanged, just reopen
                if (String(value) === String(oldTitle)) {
                    new Notice('No change made.');
                    const reopenSame = new DeletionModal(this.app);
                    reopenSame.open();
                    return;
                }

                const file = helpers.getActiveMDFile(this.app);
                if (!file) {new Notice('No active markdown file found'); return; }

                // Remove old and add new (helpers.updateFrontmatterValues toggles presence)
                await helpers.updateFrontmatterValues(this.app, file, field, oldTitle);
                await helpers.updateFrontmatterValues(this.app, file, field, value);

                new Notice(`Modified "${oldTitle}" to "${value}" in ${field}`);
                // Reopen deletion modal if shift held
                if (evt.shiftKey) {
                    const newModal = new DeletionModal(this.app);
                    setTimeout(() => newModal.open(), 100);
                }
            }, oldTitle);
            promptModal.open();
        }
    }
}   

export default class FrontmatterPlugin extends Plugin {

    async onload() {  
        // Register event for editor context menu  
        // this.registerEvent(
        //   this.app.workspace.on('file-menu', (menu, file) => {
        //     menu.addItem((item) => {
        //       item
        //         .setTitle('Print file path 👈')
        //         .setIcon('document')
        //         .onClick(async () => {
        //           new ExampleModal(this.app).open();
        //         });
        //     });
        //   })
        // );

        // this.registerEvent(
        //   this.app.workspace.on("editor-menu", (menu, editor, view) => {
        //     menu.addItem((item) => {
        //       item
        //         .setTitle('Insert category')
        //         .setIcon('document')
        //         .onClick(async () => {
        //           const modal = new ExampleModal(this.app);
        //           modal.onChooseItem = (category) => {
        //             editor.replaceRange(category.title, editor.getCursor());
        //           };
        //           modal.open();
        //         });
        //     });
        //   })
        // );

        this.addCommand({
            id: 'add-tag',
            name: 'Add Tag to Frontmatter',
            editorCallback: (editor: Editor) => {
                const modal = new MetadataModal(this.app, 'tags');
                modal.onChooseItem = (item) => {
                    if (item?.title) {
                        this.addValueToActiveNote('tags', item.title);
                    }
                };
                modal.open();
                modal.setPlaceholder('Select a tag to add');
            },
        });

        this.addCommand({
            id: 'add-category',
            name: 'Add Category to Frontmatter',
            editorCallback: (editor: Editor) => {
                const modal = new MetadataModal(this.app, 'category');
                modal.onChooseItem = (item) => {
                    if (item?.title) {
                        this.addValueToActiveNote('category', item.title);
                    }
                };
                modal.open();
                modal.setPlaceholder('Select a category to add');
            },
        });

        this.addCommand({
          id: 'frontmatter-modal',
          name: 'Add Frontmatter',
          editorCallback: (editor: Editor) => {
            const modal = new InitialModal(this.app);
            modal.open();
            modal.setPlaceholder('Add Metadata to Active Note');
          },
        });

        this.addCommand({
        id: 'remove-metadata',
        name: 'Remove Metadata',
        editorCallback: (editor: Editor) => {
            const modal = new DeletionModal(this.app);
            modal.open();
            modal.setPlaceholder('Remove Metadata from Active Note');
            },
        });

        this.registerEvent(
          this.app.vault.on('create', async (file) => {
            if (!(file instanceof TFile) || file.extension !== 'md') return;
            // Small delay to ensure the active view is set before opening modal
            setTimeout(() => new InitialModal(this.app).open(), 50);
            })
        );
    }

	async onunload() {
	}
}
