import { App, Editor, MarkdownView, parseFrontMatterEntry, Notice, Plugin, FuzzySuggestModal, SuggestModal, Modal, Setting, getAllTags } from 'obsidian';

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
        if (choice.type === 'FuzzySuggestModal') {
            const field = choice.field as 'category'|'tags'|'author';
            const metadataModal = new MetadataModal(this.app, field);
            metadataModal.open();
            metadataModal.setPlaceholder(`Select a ${field} to add`);
        } else if (choice.type === 'PromptModal') {
            const field = choice.field;
            const promptModal = new PromptModal(this.app, field, async (value) => {
                if (value) {
                    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);  
                    if (!activeView || !activeView.file) {  
                        new Notice('No active markdown file found');  
                        return;  
                    }  
                  
                    await this.app.fileManager.processFrontMatter(activeView.file, (frontmatter) => {
                        let existingValues: string[] = [];
                        if (frontmatter[field]) {
                            if (Array.isArray(frontmatter[field])) {
                                existingValues = frontmatter[field];
                            } else if (typeof frontmatter[field] === 'string') {
                                existingValues = [frontmatter[field]];
                            }
                        }

                        // Add the new value if it doesn't already exist
                        if (!existingValues.includes(value)) {
                            existingValues.push(value);
                        }

                        // Update frontmatter
                        frontmatter[field] = existingValues.length === 1 ? existingValues[0] : existingValues;
                    });

                    this.close();
                    new InitialModal(this.app).open();
                    }
                });
            promptModal.open();
        }
    };        
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
    
    private getValues(): { title: string }[] {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView); 
        const presentSet = new Set<string>();
        if (activeView && activeView.file) {      
            const cache = this.app.metadataCache.getFileCache(activeView.file);  
            if (cache) {  
                if (this.field === 'tags') {
                    const presentTags = getAllTags(cache).map(tag => tag.replace(/^#/, '')).map(tag => ({field: 'tags', title: tag}));
                    presentTags.forEach(t => presenSet.add(t));
                } else {
                    const fmValue = parseFrontMatterEntry(cache.frontmatter, this.field);
                    const fmArr = Array.isArray(fmValue) ? fmValue : (fmValue ? [fmValue] : []);
                    fmArr.forEach(v => { if (typeof v === 'string') presentSet.add(v); });
                }
            }
        }

        if (this.field === 'tags') {
            const allTags = Object.keys(this.app.metadataCache.getTags()).map(tag => tag.replace(/^#/, ''));
            return allTags
                .filter(t => !presentSet.has(t))
                .sort((a, b) => a.localeCompare(b))
                .map(t => ({ title: t }));
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
            return Array.from(values)
                .filter(v => !presentSet.has(v))
                .sort((a, b) => a.localeCompare(b))
                .map(v => ({ title: v }));
            }    
    }

    getSuggestions(query: string | undefined) {
        const raw = (query ?? '').toString();
        this.currentInput = raw.trim();
        const allValues = this.getValues();
        if(!this.currentInput) return allValues;
        
        const inputLower = this.currentInput.toLowerCase();
        const matches = allValues.filter(v =>
            typeof v.title === 'string' && v.title.toLowerCase().includes(inputLower)
        );

        //If no matches AND current input isn't equal to present values, add current input as a new value
        if (this.presentSet.includes(this.currentInput)) { this.allowCreate = false; }
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

    async onChooseSuggestion(itemOrMatch: any, evt: MouseEvent | KeyboardEvent) {
        const item = itemOrMatch?.item ?? itemOrMatch;
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);  
        if (!activeView || !activeView.file) {  
            new Notice('No active markdown file found');  
            return;  
        }  
      
        await this.app.fileManager.processFrontMatter(activeView.file, (frontmatter) => {
            let existingValues: string[] = [];
            if (frontmatter[this.field]) {
                if (Array.isArray(frontmatter[this.field])) {
                    existingValues = frontmatter[this.field];
                } else if (typeof frontmatter[this.field] === 'string') {
                    existingValues = [frontmatter[this.field]];
                }
            }

            // Add the new value if it doesn't already exist
            if (!existingValues.includes(item.title)) {
                existingValues.push(item.title);
            }

            // Update frontmatter
            frontmatter[this.field] = existingValues.length === 1 ? existingValues[0] : existingValues;
        });

        this.close();
        new InitialModal(this.app).open();
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
    }

	async onunload() {
	}
}
