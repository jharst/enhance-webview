import { App, Editor, MarkdownView, parseFrontMatterEntry, Notice, Plugin, Menu, FuzzyMatch, FuzzySuggestModal, renderResults } from 'obsidian';
interface Category {
        title: string;
        isNew?: boolean;
        id?: string;
}

export class CategoryModal extends FuzzySuggestModal<category> {
    private currentInput: string = ''
    
    private getCategories(): string[] {
        const files = this.app.vault.getMarkdownFiles();  
        const categories = new Set<string>();  
          
        for (const file of files) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter) {
            const categoryValue = parseFrontMatterEntry(cache.frontmatter, 'category');
            const values = Array.isArray(categoryValue) ? categoryValue : [categoryValue];
            for (const c of values) {
              if (typeof c === 'string') categories.add(c);
            }
          }
        }
        return Array.from(categories).sort();
    };

    getSuggestions(query: string | undefined): Category[] {
        const raw = (query ?? '').toString();
        this.currentInput = raw.trim();

        if(!this.currentInput) {
            return this.getItems();
        }

        //Get existing categories, Map strings -> Category objects so we can use .title safely
        const existingCategories: Category[] = this.getCategories().map(t => ({ title: t}));
        const inputLower = this.currentInput.toLowerCase();
        const matches = existingCategories.filter(cat =>
            typeof cat.title === 'string' && cat.title.toLowerCase().includes(inputLower)
        );

        //If no matches, add the current input as a new category
        if (matches.length === 0 && this.currentInput.length > 0) {
           return [{ title: this.currentInput, isNew: true }];
        }

        // If partial matches and no exact match, put "Create new" first
        const hasExactMatch = matches.some(cat =>
            typeof cat.title === 'string' && cat.title.toLowerCase() === inputLower
        );

        if (!hasExactMatch) {
            return [{ title: this.currentInput, isNew: true }, ...matches];
        }

        return matches;
    }
    
    getItems(): Category[] {
        // compute fresh each time from vault
        return this.getCategories().map((title) => ({ title }));
    } 
    getItemText(item: Category): string {
        return item.title;
    }
    renderSuggestion(itemOrMatch: Category | FuzzyMatch<Category>, el: HTMLElement) {
        // Be defensive: support both shapes (Category or { item: Category })
        const item: Category = (itemOrMatch && (itemOrMatch as any).item) ? (itemOrMatch as any).item : (itemOrMatch as any);

        if (item?.isNew) {
            el.createEl('div', { text: `Create new category: "${item.title}"` });
            el.addClass('suggestion-new');
        } else {
            el.createEl('div', { text: item?.title ?? '' });
        }
    }

    // onChooseSuggestion will also be called with a Category
    onChooseSuggestion(itemOrMatch: Category | FuzzyMatch<Category>, evt: MouseEvent | KeyboardEvent) {
        const chosen: Category = (itemOrMatch && (itemOrMatch as any).item) ? (itemOrMatch as any).item : (itemOrMatch as any);

        // call external handler if provided
        const callback = (this as any).onChooseItem;
        if (typeof callback === 'function') {
            callback(chosen);
            return;
        }

        // fallback behavior
        if (chosen?.isNew) {
            new Notice(`Would create new category: ${chosen.title}`);
        } else {
            new Notice(`Would select existing category: ${chosen.title}`);
        }
    }      
}  
   
export default class EnhanceWebViewerPlugin extends Plugin {
	async addCategoryToActiveNote(category: string) {  
    // Get the active markdown view  
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);  
      
    if (!activeView || !activeView.file) {  
        new Notice('No active markdown file found');  
        return;  
    }  
  
    // Use processFrontMatter to atomically modify the frontmatter  
    await this.app.fileManager.processFrontMatter(activeView.file, (frontmatter) => {  
        // Handle existing categories (both single string and array)  
        let categories: string[] = [];  
          
        if (frontmatter.category) {  
            if (Array.isArray(frontmatter.category)) {  
                categories = frontmatter.category;  
            } else if (typeof frontmatter.category === 'string') {  
                categories = [frontmatter.category];  
            }  
        }  
          
        // Add the new category if it doesn't already exist  
        if (!categories.includes(category)) {  
            categories.push(category);  
        }  
          
        // Update frontmatter  
        frontmatter.category = categories.length === 1 ? categories[0] : categories;  
    });  
      
    new Notice(`Added category: ${category}`);  
}
    async onload() {  
        // Register event for editor context menu  
        this.registerEvent(
          this.app.workspace.on('file-menu', (menu, file) => {
            menu.addItem((item) => {
              item
                .setTitle('Print file path 👈')
                .setIcon('document')
                .onClick(async () => {
                  new ExampleModal(this.app).open();
                });
            });
          })
        );

        this.registerEvent(
          this.app.workspace.on("editor-menu", (menu, editor, view) => {
            menu.addItem((item) => {
              item
                .setTitle('Insert category')
                .setIcon('document')
                .onClick(async () => {
                  const modal = new ExampleModal(this.app);
                  modal.onChooseItem = (category) => {
                    editor.replaceRange(category.title, editor.getCursor());
                  };
                  modal.open();
                });
            });
          })
        );

        this.addCommand({
          id: 'insert-category',
          name: 'Choose category to insert',
          editorCallback: (editor: Editor) => {
            const modal = new CategoryModal(this.app);
            modal.onChooseItem = (category) => {
                this.addCategoryToActiveNote(category.title);
            };
            modal.open();
            modal.setPlaceholder('Select a category to insert');
          },
        });
    }

	async onunload() {
	}
}
