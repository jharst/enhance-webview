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

    constructor(app: App, field: 'category'|'tags'|'author', allowCreate = true) {
        super(app);
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

        //If no matches AND current input isn't equal to present values, add current input as a new value
        const inActiveNoteExact = Array.from(this.presentMetadata).some(v => v.title.toLowerCase() === inputLower);
        const inActiveNotePrefix = Array.from(this.presentMetadata).some(v => v.title.toLowerCase().startsWith(inputLower));
        this.allowCreate = !(inActiveNoteExact);
        if (this.currentInput.length > 3 && inActiveNotePrefix) { this.allowCreate = false; }
        if (matches.length === 0 && this.allowCreate) {
           return [{ title: this.currentInput, field: this.field, isNew: true }];
        }

        // If partial matches and no exact match, put "Create new" first
        const hasExactMatch = matches.some(m =>
            typeof m.title === 'string' && m.title.toLowerCase() === inputLower
        );

        if (!hasExactMatch && this.allowCreate) {
            return [{ title: this.currentInput, field: this.field, isNew: true }, ...matches];
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
        
        this.close();
        new InitialModal(this.app).open();
    }
}  

export class DeletionModal extends FuzzySuggestModal <Metadata> {
    private modifyMode = false;
    public setModifyMode(v: boolean) { this.modifyMode = v; }
    private onGlobalKeyDownBound: (e: KeyboardEvent) => void;
    private onGlobalKeyUpBound: (e: KeyboardEvent) => void;
    
    constructor(app: App) {  
        super(app);    
        // Set instructions to show keyboard shortcuts  
        this.setInstructions([{  
          command: "↑↓",  
          purpose: "Navigate suggestions"  
        }, {  
          command: "↵",  
          purpose: "Delete selected item"  
        }, {  
          command: "⌘ ↵",  
          purpose: "Modify selected item"  
        }, {  
          command: "esc",  
          purpose: "Cancel"  
        }]);    

        this.setPlaceholder('Remove Metadata from Active Note');
        
        this.scope.register(["Mod"], "Enter", (evt) => {  
            new Notice("Modify action triggered");  
            console.log("Scope: ", evt)
            this.selectActiveSuggestion(evt);
            return false;
        });
        
        // document.addEventListener("keydown", (evt) => {  
        //     if (evt.key === "Shift") {  
        //         this.toggle = true;
        //         new Notice("Shift key");  
        //     }  
        // });

        this.onGlobalKeyDownBound = this.onGlobalKeyDown.bind(this);
        this.onGlobalKeyUpBound = this.onGlobalKeyUp.bind(this);
    }  

    onOpen() {
        super.onOpen?.();
        // debugger;
        window.addEventListener("keydown", this.onGlobalKeyDownBound);
        window.addEventListener("keyup", this.onGlobalKeyUpBound);
        console.log("DeletionModal opened, event listeners added");
    }

    onClose() {
        window.removeEventListener("keydown", this.onGlobalKeyDownBound);
        window.removeEventListener("keyup", this.onGlobalKeyUpBound);
        super.onClose?.();
    }

    private onGlobalKeyDown(e: KeyboardEvent) {
        console.log("onGlobalKeyDown triggered");
        if (e.ctrlKey || e.metaKey) {
          if (!this.modifyMode) {
            this.modifyMode = true;
            console.log("onGlobalKeyDown triggered");
            console.log("modify mode: ", this.modifyMode);
            this.updateSuggestionSubtitles();
          }
        }
    }

    private onGlobalKeyUp(e: KeyboardEvent) {
        // when neither modifier is pressed, turn modifyMode off
        console.log("onGlobalKeyUp triggered");
        if (!e.ctrlKey && !e.metaKey) {
          if (this.modifyMode) {
            this.modifyMode = false;
            this.updateSuggestionSubtitles();
          }
        }
    }

    // Call this after you set this.modifyMode = true/false
    private updateSuggestionSubtitles() {
      const anyThis = this as any;

      // Try common container names the runtime may use
      const suggestionsEl: HTMLElement | undefined =
        anyThis.suggestionsEl ?? anyThis.resultContainerEl ?? undefined;

      if (!suggestionsEl) {
        // no DOM to update; fall back to your close/reopen logic if needed
        return;
      } else {console.log(suggestionsEl);}

      // Use requestAnimationFrame to batch DOM writes and avoid layout thrash
      requestAnimationFrame(() => {
        // Each suggestion item often contains a small.suggestion-subtitle element.
        // If not present, look for <small> in the item.
        const items = Array.from(suggestionsEl.children) as HTMLElement[];
        for (const item of items) {
          // Find subtitle node that you created in renderSuggestion
          let subtitle = item.querySelector('small.suggestion-subtitle') as HTMLElement | null;
          if (!subtitle) {
            // fallback: any <small> child
            subtitle = item.querySelector('small') as HTMLElement | null;
          }
          if (!subtitle) continue;

          // Build the new subtitle text using the same format your renderSuggestion used
          // (make sure this matches your earlier renderSuggestion string)
          // e.g. "Modify values for author: John" or "Remove values for author: John"
          // We attempt to preserve the suffix after the "for " part.
          const old = subtitle.textContent ?? '';
          // If you constructed subtitle exactly as: `${prefix} ${choice.field}: ${choice.title}`
          // and you cannot readily reconstruct the field/title from DOM, we can replace the prefix.
          const newPrefix = this.modifyMode ? 'Modify values for ' : 'Remove values for ';

          // Try to find the first ':' occurrence (separator between field and title) and keep the rest
          const colonIndex = old.indexOf(':');
          const rest = colonIndex >= 0 ? old.slice(colonIndex + 1) : old;
          // Try to extract the field part between 'for ' and ':' so we can keep it if needed
          const fieldPart = colonIndex >= 0 ? (old.slice(0, colonIndex).replace(/^(Modify|Remove) values for /, '')).trim() : '';
          // If we have fieldPart and rest, compose deterministic new subtitle:
          if (fieldPart) {
            subtitle.textContent = `${newPrefix}${fieldPart}: ${rest.trim()}`;
          } else {
            // Fallback: just replace the prefix if present, otherwise set newPrefix + old
            // Detect and replace existing 'Remove values for ' or 'Modify values for '
            if (old.startsWith('Remove values for ')) {
              subtitle.textContent = old.replace('Remove values for ', newPrefix);
            } else if (old.startsWith('Modify values for ')) {
              subtitle.textContent = old.replace('Modify values for ', newPrefix);
            } else {
              subtitle.textContent = newPrefix + old;
            }
          }
        }
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
        // Use the modifyMode flag to change the subtitle text dynamically
        const subtitle = (this.modifyMode ? 'Modify values for ' : 'Remove values for ') + choice.field + ': ' + choice.title;
        el.createEl('small', { text: subtitle, cls: 'suggestion-subtitle'});
    }

    async onChooseSuggestion(choice: Metadata, evt: MouseEvent | KeyboardEvent) {
        console.log("onChooseSuggestion: ", evt, "\n", choice);
        //If meta key held, open prompt to modify
        if (evt instanceof KeyboardEvent && (evt.ctrlKey || evt.metaKey)) {
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
                // Reopen deletion modal after timeout
                const newModal = new DeletionModal(this.app);
                setTimeout(() => newModal.open(), 100);
            }, oldTitle);
            promptModal.open();
        } else {
            // Proceed with deletion
            const file = helpers.getActiveMDFile(this.app);
            if (!file) {new Notice('No active markdown file found'); return; }
            
            const changed = helpers.updateFrontmatterValues(this.app, file, choice.field, choice.title);
            if (changed) { new Notice(`Removed "${choice.title}" from ${choice.field}`); }
            await new Promise(res => setTimeout(res, 100)); // 50-200ms usually enough
            const remainingChoices = await this.getSuggestions('');
            if (remainingChoices.length > 0) {
                 const newModal = new DeletionModal(this.app);
                 newModal.open();
            } else {
                 new Notice('All metadata removed.');
            }
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
