import { App, MarkdownView, TFile, parseFrontMatterEntry, getAllTags } from 'obsidian';

interface Metadata {
    title: string;
    field: string;
}

export function getActiveMDFile(app: App): TFile | null {
	const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);  
    if (!activeView || !activeView.file) return null;  
    if (!(activeView.file instanceof TFile) || activeView.file.extension !== 'md') return null;
	return activeView.file;
}

export async function updateFrontmatterValues(app: App, file: TFile, field: string, item: string | number): Promise<boolean> {
	let changed = false;
	await app.fileManager.processFrontMatter(file, (frontmatter: any) => {
        const val = frontmatter?.[field];
        const existingValues: any[] = [];
       
        // Normalize existing value(s) preserving original types
	    if (val !== undefined) {
	      if (Array.isArray(val)) {
	        existingValues.push(...val);
	      } else {
	        existingValues.push(val);
	      }
	    }

        // Add the new value if it doesn't already exist, delete it if it does
        // Match by string form so numbers and strings compare equal (e.g., 2012 === "2012")
	    const matches = (a: any, b: any) => String(a) === String(b);
	    const hasItem = existingValues.some(v => matches(v, item));

        if (!hasItem) {
            existingValues.push(item);
            frontmatter[field] = existingValues.length === 1 ? existingValues[0] : existingValues;
     		changed = true;
        } else if (hasItem) {
          	const newValues = existingValues.filter(v => !matches(v, item));
          	if (newValues.length === 0) {
  			    delete frontmatter[field];
  			    changed = true;
  		    } else if (newValues.length === 1) {
  		      	frontmatter[field] = newValues[0];
  		      	changed = true;
  		    } else {
  		      	frontmatter[field] = newValues;
  		      	changed = true;
  		    }
        }
    });
    return changed;
}

export function readFrontmatterValuesfromActiveFile(app: App, file: TFile, field: string): Metadata[] {
  const metadataSet = new Set <Metadata>();
  const cache = app.metadataCache.getFileCache(file);
  if (!cache?.frontmatter) return [];

  if (field === 'tags') {
  	const presentTags = getAllTags(cache).map(tag => tag.replace(/^#/, ''));
    presentTags.forEach(t => metadataSet.add({ title: t, field: 'tags' }));
  } else if (field === 'all') {
      for (const [key, value] of Object.entries(cache.frontmatter)) {
          const fmArr = Array.isArray(value) ? value : (value ? [value] : []);
          fmArr.forEach(v => {
            if (typeof v === 'string' || typeof v === 'number') {
                metadataSet.add({ title: v, field: key });
            }
          });
      }
  } else {
  	const fmValue = parseFrontMatterEntry(cache.frontmatter, field);
    const fmArr = Array.isArray(fmValue) ? fmValue : (fmValue ? [fmValue] : []);
    fmArr.forEach(v => metadataSet.add({ title: v, field: field}));
  }
  return Array.from(metadataSet);
}

export function readFrontmatterValuesfromVault(app: App, field: string, presentMetadata: string[]): { title: string}[] {
   if (this.field === 'tags') {
        const allTags = Object.keys(app.metadataCache.getTags()).map(tag => tag.replace(/^#/, ''));
        return allTags
            .filter(t => !presentMetadata.some(metadata => metadata.title === t))
            .sort((a, b) => a.localeCompare(b))
            .map(t => ({ title: t }));
    } else {
        const files = app.vault.getMarkdownFiles();  
        const values = new Set<string>();  
        for (const file of files) {
          const cache = app.metadataCache.getFileCache(file);
          if (cache?.frontmatter) {
            const metadata = parseFrontMatterEntry(cache.frontmatter, field);
            const newValues = Array.isArray(metadata) ? metadata : [metadata];
            for (const c of newValues) {
              if (typeof c === 'string') values.add(c);
            }
          }
    	}
        return Array.from(values)
            .filter(v => !presentMetadata.some(metadata => metadata.title === v))
            .sort((a, b) => a.localeCompare(b))
            .map(v => ({ title: v }));
    }
}	


 