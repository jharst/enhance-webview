import { App, Editor, MarkdownView, parseFrontMatterEntry, Notice, Plugin, FuzzySuggestModal, SuggestModal, Modal, Setting } from 'obsidian';

interface Category {
    title: string;
    isNew?: boolean;
    id?: string;
}

interface MetadataChoice {
    title: string;
    field: string;
}

interface InitialChoice {
    title: string;
    subtitle: string;
    type: 'FuzzySuggestModal'|'PromptModal';
    field: 'category'|'tags'|'aliases'|'author'|'year';
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
       // Call the onChooseItem callback if provided (so external handlers run)
        const callback = (this as any).onChooseItem;
        if (typeof callback === 'function') {
            callback(choice);
            return;
        }

        // Fallback behavior if no callback provided
        new Notice(`Selected ${choice.title}`);
        return choice;
    }
}

export class PromptModal extends Modal {
    constructor(app: App, field: string, onSubmit: (result: string) => void) {
        super(app);
        this.setTitle('Input Value for ' + field);

        let newValue = '';
        new Setting(this.contentEl)
            .setName(field)
            .addText((text) =>
                text.onChange((value) => {
                    newValue = value;
                })
            );

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

export class MetadataModal extends FuzzySuggestModal<{ title: string; isNew?: boolean }> {
    private field: 'category'|'tags'|'author';
    private currentInput: string = '';
    private allowCreate: boolean;

    constructor(app: App, field: 'category'|'tags'|'author', allowCreate = true) {
        super(app);
        this.field = field;
        this.allowCreate = allowCreate;
    }
    
    private getValues(): string [] {
        if (this.field === 'tags') {
            const tags = Object.keys(this.app.metadataCache.getTags()).map(tag => tag.replace(/^#/, ''));
            return tags.sort();
        } else {
            const files = this.app.vault.getMarkdownFiles();  
            const values = new Set<string>();  
              
            for (const file of files) {
              const cache = this.app.metadataCache.getFileCache(file);
              if (cache?.frontmatter) {
                const metadata = parseFrontMatterEntry(cache.frontmatter, this.field);
                const newValues = Array.isArray(metadata) ? metadata : [metadata];
                for (const c of newValues) {
                  if (typeof c === 'string') values.add(c);
                }
              }
            }
            return Array.from(values).sort();
        }    
    };

    // private getCategories(): string[] {
    //     const files = this.app.vault.getMarkdownFiles();  
    //     const categories = new Set<string>();  
          
    //     for (const file of files) {
    //       const cache = this.app.metadataCache.getFileCache(file);
    //       if (cache?.frontmatter) {
    //         const categoryValue = parseFrontMatterEntry(cache.frontmatter, 'category');
    //         const values = Array.isArray(categoryValue) ? categoryValue : [categoryValue];
    //         for (const c of values) {
    //           if (typeof c === 'string') categories.add(c);
    //         }
    //       }
    //     }
    //     return Array.from(categories).sort();
    // };

    getSuggestions(query: string | undefined) {
        const raw = (query ?? '').toString();
        this.currentInput = raw.trim();
        const allValues = this.getValues().map(t => ({ title: t}));
        if(!this.currentInput) return allValues;
        
        const inputLower = this.currentInput.toLowerCase();
        const matches = allValues.filter(v =>
            typeof v.title === 'string' && v.title.toLowerCase().includes(inputLower)
        );

        //If no matches, add the current input as a new category
        if (matches.length === 0 && this.allowCreate && this.currentInput.length > 0) {
           return [{ title: this.currentInput, isNew: true }];
        }

        // If partial matches and no exact match, put "Create new" first
        const hasExactMatch = matches.some(m =>
            typeof m.title === 'string' && m.title.toLowerCase() === inputLower
        );

        if (!hasExactMatch && this.allowCreate) {
            return [{ title: this.currentInput, isNew: true }, ...matches];
        }

        return matches;
    }
    
    getItemText(item: { title: string }) { return item.title; }

    renderSuggestion(itemOrMatch: any, el: HTMLElement) {
        const item = itemOrMatch?.item ?? itemOrMatch;
        if (item?.isNew) {
            el.createEl('div', { text: `Create new ${this.field}: "${item.title}"` });
            el.addClass('suggestion-new');
        } else {
            el.createEl('div', { text: item.title });
        }
    }

    // onChooseSuggestion will also be called with a Category
    onChooseSuggestion(itemOrMatch: any, evt: MouseEvent | KeyboardEvent) {
        const item = itemOrMatch?.item ?? itemOrMatch;

        // call external handler if provided
        const callback = (this as any).onChooseItem;
        if (typeof callback === 'function') {
            callback(item);
            return;
        }

        // fallback behavior
        if (item?.isNew) {
            new Notice(`Would create new category: ${item.title}`);
        } else {
            new Notice(`Would select existing category: ${item.title}`);
        }
    }      
}  

export class DeletionModal extends SuggestModal <MetadataChoice> {
    async getSuggestions(query: string): MetadataChoice[] {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || !activeView.file) {  
            new Notice('No active markdown file found');  
            return [];  
        }  
        const metadataChoices: MetadataChoice[] = [];
        await this.app.fileManager.processFrontMatter(activeView.file, (frontmatter) => {
            if (frontmatter) {
                for (const [key, value] of Object.entries(frontmatter)) {
                    if (Array.isArray(value)) {
                        for (const item of value) {
                            metadataChoices.push({ field: key, title: String(item) });
                        }
                    } else {
                        metadataChoices.push({ field: key, title: String(value) });
                    }
                }
            }
        });
        return metadataChoices;
    }

    renderSuggestion(choice: MetadataChoice, el: HTMLElement) {
        el.createEl('div', { text: choice.title });
        el.createEl('small', { text: 'Remove values for ' + choice.field + ': ' + choice.title, cls: 'suggestion-subtitle' });
    }

    async onChooseSuggestion(choice: MetadataChoice, evt: MouseEvent | KeyboardEvent) {
       // Call the onChooseItem callback if provided (so external handlers run)
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || !activeView.file) {  
            new Notice('No active markdown file found');  
            return;  
        }
        
        await this.app.fileManager.processFrontMatter(activeView.file, (frontmatter) => {
            if (frontmatter) {
                if (Array.isArray(frontmatter[choice.field])) {
                    frontmatter[choice.field] = frontmatter[choice.field].filter((v: string) => v !== choice.title);
                    if (frontmatter[choice.field].length === 0) {
                        delete frontmatter[choice.field];
                    }
                } else if (frontmatter[choice.field] === choice.title) {
                    delete frontmatter[choice.field];
                }
            }
        })

       const remainingChoices = await this.getSuggestions('');
       if (remainingChoices.length > 0) {
            const newModal = new DeletionModal(this.app);
            newModal.open();
        } else {
            new Notice('All metadata removed.');
        }
    }
}   

export default class FrontmatterPlugin extends Plugin {

    async addValueToActiveNote(field: string, newValue: string) {  
        // Get the active markdown view  
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);  
          
        if (!activeView || !activeView.file) {  
            new Notice('No active markdown file found');  
            return;  
        }  
      
        // Use processFrontMatter to atomically modify the frontmatter  
        await this.app.fileManager.processFrontMatter(activeView.file, (frontmatter) => {
            // Handle existing values of chosen field
            let existingValues: string[] = [];

            if (frontmatter[field]) {
                if (Array.isArray(frontmatter[field])) {
                    existingValues = frontmatter[field];
                } else if (typeof frontmatter[field] === 'string') {
                    existingValues = [frontmatter[field]];
                }
            }

            // Add the new value if it doesn't already exist
            if (!existingValues.includes(newValue)) {
                existingValues.push(newValue);
            }

            // Update frontmatter
            frontmatter[field] = existingValues.length === 1 ? existingValues[0] : existingValues;
        });

        new Notice(`Added ${field}: ${newValue}`);  
    }

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
            modal.onChooseItem = (choice) => {
                if (choice.type === 'FuzzySuggestModal') {
                    const field = choice.field as 'category'|'tags'|'author';
                    const metadataModal = new MetadataModal(this.app, field);
                    metadataModal.onChooseItem = (item) => {
                        if (item?.title) {
                            this.addValueToActiveNote(field, item.title);
                        }
                    };
                    metadataModal.open();
                    metadataModal.setPlaceholder(`Select a ${field} to add`);
                } else if (choice.type === 'PromptModal') {
                    const field = choice.field;
                    const promptModal = new PromptModal(this.app, field, (value) => {
                        if (value) {
                            this.addValueToActiveNote(field, value);
                        }
                    });
                    promptModal.open();
                }
            };
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
    }

	async onunload() {
	}
}
