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
    
    getItems(): Category[] {
    // compute fresh each time from vault
    return this.getCategories().map((title) => ({ title }));
  }

    getSuggestions(query: string): FuzzyMatch<Category>[] {
        this.currentInput = query.trim();

        if(!this.currentInput) {
            return [];
        }

        //Get existing categories
        const existingCategories = this.getCategories();
        const matches = existingCategories.filter(category =>
            category.title.toLowerCase().includes(this.currentInput.toLowerCase())
        );

        //If no matches, add the current input as a new category
        if (matches.length === 0 && this.currentInput.length > 0) {  
            const newCategory: Category = { title: this.currentInput, isNew: true };  
            return [{ item: newCategory, match: { score: 1, matches: [] } }];  
        }  

        // If partial matches, add "Create new" as first option  
        if (this.currentInput.length > 0) {  
            const hasExactMatch = matches.some(cat =>   
                cat.title.toLowerCase() === this.currentInput.toLowerCase()  
            );  
              
            if (!hasExactMatch) {  
                const newCategory: Category = { title: this.currentInput, isNew: true };  
                const createNewOption = { item: newCategory, match: { score: 1, matches: [] } };  
                return [createNewOption, ...matches.map(cat => ({  
                    item: cat,   
                    match: { score: 0.8, matches: [] }  
                }))];  
            }  
        }  

        return matches.map(cat => ({  
            item: cat,   
            match: { score: 0.8, matches: [] }  
        }));  
    }  
  
    renderSuggestion(match: FuzzyMatch<Category>, el: HTMLElement) {  
       if (item.item.isNew) {  
            el.createEl('div', { text: `Create new category: "${item.item.title}"` });  
            el.addClass('suggestion-new');  
        } else {  
            el.createEl('div', { text: item.item.title });  
        }  
    }  
  
    onChooseSuggestion(item: FuzzyMatch<Category>, evt: MouseEvent | KeyboardEvent) {  
        if (item.item.isNew) {  
            this.createNewCategory(item.item.title);  
        } else {  
            this.selectExistingCategory(item.item);  
        }  
        this.close();  
    }  
  
    private createNewCategory(title: string) {  
        // Create the new category logic  
        const newCategory = { title, id: generateId() };  
        this.saveCategory(newCategory);  
        this.addCategoryToActiveNote(title);  
    }  
  
    private selectExistingCategory(category: Category) {  
        this.addCategoryToActiveNote(category.title);  
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
