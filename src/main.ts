import { App, Editor, MarkdownView, Notice, Plugin, Menu, FuzzyMatch, FuzzySuggestModal, renderResults } from 'obsidian';

interface Category {
    title: string;
}

const ALL_CATEGORIES = getCategories.call(this).map((cat) => ({ title: cat } as category));

function getCategories() {
    const files = this.app.vault.getMarkdownFiles();  
    const categories = new Set<string>();  
      
    for (const file of files) {  
        const cache = this.app.metadataCache.getFileCache(file);  
        if (cache?.frontmatter?.category) {  
            // Handle both single string values and arrays  
            const categoryValues = Array.isArray(cache.frontmatter.category)   
                ? cache.frontmatter.category   
                : [cache.frontmatter.category];  
              
            for (const category of categoryValues) {  
                if (typeof category === 'string') {  
                    categories.add(category);  
                }  
            }  
        }  
    }  
    return Array.from(categories).sort();
}

// Remember to rename these classes and interfaces!
export class ExampleModal extends FuzzySuggestModal<category> {
    // Returns all available suggestions.
    getItemText(item: Category): string {  
       return item.title;  
    }  
  
    getItems(): Category[] {  
       return ALL_CATEGORIES;  
    }  
  
    renderSuggestion(match: FuzzyMatch<Category>, el: HTMLElement) {  
       const titleEl = el.createDiv();  
       renderResults(titleEl, match.item.title, match.match);  
  
       // Only render the matches in the author name.  
       const authorEl = el.createEl('small');  
       const offset = -(match.item.title.length + 1);  
       renderResults(authorEl, match.item.title, match.match, offset);  
    }  
  
    onChooseItem(category: Category, evt: MouseEvent | KeyboardEvent): void {  
       new Notice(`Selected ${category.title}`);  
    }  
}

export default class EnhanceWebViewerPlugin extends Plugin {
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
            const modal = new ExampleModal(this.app);
            modal.onChooseItem = (category) => {
                const replacement = `category: ['` + category.title + `']`;
                editor.replaceRange(replacement, editor.getCursor());
            };
            modal.open();
          },
        });
    }

	async onunload() {
	}
}