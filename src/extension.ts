// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Data types
interface VirtualFolder {
	id: string;
	name: string;
	type: 'virtual-folder';
	children: FavoriteItem[];
}

type FavoriteItem = string | VirtualFolder;

interface FavoriteFolder extends vscode.TreeItem {
	uri?: vscode.Uri;
	item: FavoriteItem;
}

function generateId(): string {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function getLastModified(item: FavoriteItem): number {
	if (typeof item === 'string') {
		try {
			const uri = vscode.Uri.parse(item);
			const fsPath = uri.fsPath;
			if (fs.existsSync(fsPath)) {
				return fs.statSync(fsPath).mtime.getTime();
			}
		} catch (e) {
			console.error('Error getting stat for', item, e);
		}
		return 0;
	} else {
		// Virtual Folder: max of children
		if (!item.children || item.children.length === 0) return 0;
		const childrenTimes = item.children.map(child => getLastModified(child));
		return Math.max(...childrenTimes);
	}
}

function sortItems(items: FavoriteItem[], sortBy: string): FavoriteItem[] {
	if (sortBy === 'manual') return items;

	const sorted = [...items];
	sorted.sort((a, b) => {
		if (sortBy === 'alphabetical') {
			const nameA = typeof a === 'string' ? path.basename(vscode.Uri.parse(a).fsPath) : a.name;
			const nameB = typeof b === 'string' ? path.basename(vscode.Uri.parse(b).fsPath) : b.name;
			return nameA.localeCompare(nameB);
		} else if (sortBy === 'lastModified') {
			const timeA = getLastModified(a);
			const timeB = getLastModified(b);
			return timeB - timeA; // Descending (newest first)
		}
		return 0;
	});
	return sorted;
}

class FavoriteFoldersProvider implements vscode.TreeDataProvider<FavoriteFolder | vscode.TreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<FavoriteFolder | vscode.TreeItem | undefined | void> = new vscode.EventEmitter<FavoriteFolder | vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<FavoriteFolder | vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext) { }

	getTreeItem(element: FavoriteFolder | vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: FavoriteFolder | vscode.TreeItem): Promise<(FavoriteFolder | vscode.TreeItem)[]> {
		if (!element) {
			const favorites = this.context.globalState.get<FavoriteItem[]>('quickFolders', []);
			return this.createTreeItems(favorites);
		} else {
			const favItem = (element as FavoriteFolder).item;
			if (favItem && typeof favItem === 'object' && favItem.type === 'virtual-folder') {
				return this.createTreeItems(favItem.children);
			}

			// Always use .resourceUri for all folders, fallback to .uri for top-level
			const folderUri: vscode.Uri | undefined = (element as any).resourceUri || (element as any).uri;
			const folderPath = folderUri?.fsPath;
			if (!folderPath || !fs.existsSync(folderPath)) return [];
			let files: string[] = [];
			try {
				files = fs.readdirSync(folderPath);
			} catch (err) {
				console.error(`Failed to read directory: ${folderPath}`, err);
				vscode.window.showWarningMessage(`Cannot access folder: ${folderPath}`);
				return [];
			}
			return files.map(file => {
				const filePath = path.join(folderPath, file);
				const stat = fs.statSync(filePath);
				const fileItem = new vscode.TreeItem(file, stat.isDirectory() ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
				fileItem.resourceUri = vscode.Uri.file(filePath);
				if (stat.isDirectory()) {
					(fileItem as any).uri = vscode.Uri.file(filePath); // for compatibility
					// Set a different contextValue for second-level and deeper folders
					fileItem.contextValue = 'favoriteFolderChildFolder';
				}
				else {
					fileItem.contextValue = 'favoriteFolderChildFile';
					fileItem.command = {
						command: 'vscode.open',
						title: 'Open File',
						arguments: [vscode.Uri.file(filePath)]
					};
				}
				return fileItem;
			});
		}
	}

	private createTreeItems(items: FavoriteItem[]): FavoriteFolder[] {
		const config = vscode.workspace.getConfiguration('quickFolders');
		const expandFirstRoot = config.get<boolean>('expandFirstRoot', true);
		const sortBy = config.get<string>('sortBy', 'manual');

		const itemsToRender = sortItems(items, sortBy);

		return itemsToRender.map((item, index) => {
			if (typeof item === 'string') {
				const uri = vscode.Uri.parse(item);
				const collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
				
				const treeItem: FavoriteFolder = new vscode.TreeItem(uri.fsPath.split(/[\\/]/).pop() || uri.fsPath, collapsibleState) as FavoriteFolder;
				treeItem.uri = uri;
				treeItem.resourceUri = uri;
				treeItem.contextValue = 'favoriteFolder';
				treeItem.item = item;
				// Tooltip
				treeItem.tooltip = uri.fsPath;
				return treeItem;
			} else {
				const treeItem: FavoriteFolder = new vscode.TreeItem(item.name, vscode.TreeItemCollapsibleState.Collapsed) as FavoriteFolder;
				treeItem.contextValue = 'virtualFolder';
				treeItem.iconPath = new vscode.ThemeIcon('files');
				treeItem.item = item;
				treeItem.tooltip = item.name;
				return treeItem;
			}
		});
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}
}

function isSame(a: FavoriteItem, b: FavoriteItem): boolean {
	if (typeof a === 'string' && typeof b === 'string') return a === b;
	if (typeof a === 'object' && typeof b === 'object') return a.id === b.id;
	return false;
}

function removeItemRecursive(items: FavoriteItem[], itemToRemove: FavoriteItem): boolean {
	for (let i = 0; i < items.length; i++) {
		if (isSame(items[i], itemToRemove)) {
			items.splice(i, 1);
			return true;
		}
		const it = items[i];
		if (typeof it === 'object' && it.type === 'virtual-folder') {
			if (removeItemRecursive(it.children, itemToRemove)) return true;
		}
	}
	return false;
}

function findVirtualFolder(items: FavoriteItem[], id: string): VirtualFolder | undefined {
	for (const item of items) {
		if (typeof item === 'object' && item.type === 'virtual-folder') {
			if (item.id === id) return item;
			const found = findVirtualFolder(item.children, id);
			if (found) return found;
		}
	}
	return undefined;
}

function isDescendantOrSelf(source: FavoriteItem, target: FavoriteItem | undefined): boolean {
	if (!target) return false;
	if (isSame(source, target)) return true;
	if (typeof source === 'object' && source.type === 'virtual-folder' && typeof target === 'object' && target.type === 'virtual-folder') {
		return !!findVirtualFolder(source.children, target.id);
	}
	return false;
}

class FavoriteFoldersDragAndDropController implements vscode.TreeDragAndDropController<FavoriteFolder> {
	readonly dropMimeTypes = ['text/uri-list', 'application/vnd.code.tree.favoriteFolderView'];
	readonly dragMimeTypes = ['application/vnd.code.tree.favoriteFolderView'];
	constructor(private context: vscode.ExtensionContext, private provider: FavoriteFoldersProvider) { }

	async handleDrag(source: FavoriteFolder[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
		dataTransfer.set('application/vnd.code.tree.favoriteFolderView', new vscode.DataTransferItem(source));
	}

	async handleDrop(target: FavoriteFolder | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken) {
		const favorites = this.context.globalState.get<FavoriteItem[]>('quickFolders', []);
		
		// Determine the destination array
		let destinationList = favorites;
		if (target) {
			if (target.item && typeof target.item === 'object' && target.item.type === 'virtual-folder') {
				// Find the virtual folder in the fresh copy of favorites to ensure we are modifying the one we will save
				// We need a way to find the target object in the 'favorites' tree.
				const targetId = target.item.id;
				const foundTarget = findVirtualFolder(favorites, targetId);
				if (foundTarget) {
					destinationList = foundTarget.children;
				} else {
					return; // Target not found? Should not happen.
				}
			} else {
				// Dropping onto a real folder or something else. 
				// For now, let's disallow dropping ONTO a file/real folder to nest it. 
				// We could implement "insert before/after", but that requires more complex logic.
				// If user drops on a real folder, maybe they meant to drop on the parent? 
				// VS Code UI usually handles "between" drops by calling handleDrop with the parent? 
				// Actually, if we drop *on* an item, target is that item.
				return; 
			}
		}

		let updated = false;

		// 1. Handle Internal Drag (Move)
		const treeItemsItem = dataTransfer.get('application/vnd.code.tree.favoriteFolderView');
		if (treeItemsItem) {
			const sources = treeItemsItem.value as FavoriteFolder[];
			for (const source of sources) {
				if (source.item) {
					// Prevent dropping into itself or its children
					if (isDescendantOrSelf(source.item, target?.item)) {
						continue; 
					}

					// Remove from old location
					const removed = removeItemRecursive(favorites, source.item);
					if (removed) {
						// Add to new location
						destinationList.push(source.item);
						updated = true;
					}
				}
			}
		} 
		
		// 2. Handle External Drag (File/Folder URIs)
		// Only if we didn't just process an internal move (or maybe both?)
		// Typically drag is either internal or external.
		if (!updated) {
			const uriList = dataTransfer.get('text/uri-list');
			if (uriList) {
				const value = uriList.value as string;
				const uris = value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => vscode.Uri.parse(s));
				
				for (const uri of uris) {
					if (uri.scheme === 'file') {
						// Check if already exists in destination?
						// Simplified: Just add it.
						// We should probably check for duplicates in the *entire* tree if we want uniqueness, 
						// or just in the current folder.
						// Let's allow duplicates for now or check current folder.
						const exists = destinationList.some(item => typeof item === 'string' && item === uri.toString());
						if (!exists) {
							destinationList.push(uri.toString());
							updated = true;
						}
					}
				}
			}
		}

		if (updated) {
			await this.context.globalState.update('quickFolders', favorites);
			this.provider.refresh();
		}
	}
}


// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const provider = new FavoriteFoldersProvider(context);
	const dnd = new FavoriteFoldersDragAndDropController(context, provider);
	vscode.window.createTreeView('favoriteFolderView', {
		treeDataProvider: provider,
		dragAndDropController: dnd,
		showCollapseAll: true
	});

	// Register a configuration change listener to refresh the view when settings change
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('quickFolders.expandFirstRoot') || e.affectsConfiguration('quickFolders.sortBy')) {
				provider.refresh();
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('favorite-folders.sort', async () => {
			const config = vscode.workspace.getConfiguration('quickFolders');
			const currentSort = config.get<string>('sortBy', 'manual');

			const items = [
				{ label: 'Manual', description: 'Default order (drag & drop)', value: 'manual' },
				{ label: 'Alphabetical', description: 'Sort by name (A-Z)', value: 'alphabetical' },
				{ label: 'Last Modified', description: 'Sort by modification time (newest first)', value: 'lastModified' }
			];

			// Mark current selection
			const quickPickItems = items.map(item => ({
				...item,
				picked: item.value === currentSort
			}));

			const selected = await vscode.window.showQuickPick(quickPickItems, {
				placeHolder: 'Select Sort Order'
			});

			if (selected) {
				await config.update('sortBy', selected.value, vscode.ConfigurationTarget.Global);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('favorite-folders.createVirtualFolder', async (parent?: FavoriteFolder) => {
			const name = await vscode.window.showInputBox({ prompt: 'Enter Virtual Folder Name' });
			if (!name) return;

			const newFolder: VirtualFolder = {
				id: generateId(),
				name: name,
				type: 'virtual-folder',
				children: []
			};

			const favorites = context.globalState.get<FavoriteItem[]>('quickFolders', []);
			
			if (parent && parent.item && typeof parent.item === 'object' && parent.item.type === 'virtual-folder') {
				const parentFolder = findVirtualFolder(favorites, parent.item.id);
				if (parentFolder) {
					parentFolder.children.push(newFolder);
				} else {
					favorites.push(newFolder); // Fallback
				}
			} else {
				favorites.push(newFolder);
			}

			await context.globalState.update('quickFolders', favorites);
			provider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('favorite-folders.addFolder', async (uri?: vscode.Uri) => {
			let folderUri: vscode.Uri | undefined = uri;
			if (!folderUri) {
				const selected = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
				if (selected && selected[0]) {
					folderUri = selected[0];
				}
			}
			if (folderUri) {
				const favorites = context.globalState.get<FavoriteItem[]>('quickFolders', []);
				// Check if already exists at root level? Or just add.
				// Check existence as string
				const exists = favorites.some(fav => typeof fav === 'string' && fav === folderUri!.toString());
				
				if (!exists) {
					favorites.push(folderUri.toString());
					await context.globalState.update('quickFolders', favorites);
					provider.refresh();
				}
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('favorite-folders.removeFolder', async (itemOrUri?: FavoriteFolder | vscode.Uri) => {
			const favorites = context.globalState.get<FavoriteItem[]>('quickFolders', []);
			let itemToRemove: FavoriteItem | undefined;

			if (itemOrUri) {
				if (itemOrUri instanceof vscode.Uri) {
					// Passed a URI (e.g. from simple command call with arg)
					itemToRemove = itemOrUri.toString();
				} else if ((itemOrUri as FavoriteFolder).item) {
					// Passed a TreeItem
					itemToRemove = (itemOrUri as FavoriteFolder).item;
				} else if ((itemOrUri as FavoriteFolder).uri) {
					// Legacy fallback
					itemToRemove = (itemOrUri as FavoriteFolder).uri?.toString();
				}
			}

			if (!itemToRemove) {
				// If no item context, maybe ask user to select from list? 
				// For now, let's just show an error if no context.
				// Or maybe we can show a QuickPick of root items?
				vscode.window.showWarningMessage('Please select an item to remove.');
				return;
			}

			if (removeItemRecursive(favorites, itemToRemove)) {
				await context.globalState.update('quickFolders', favorites);
				provider.refresh();
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('favorite-folders.openFolder', async (itemOrUri?: FavoriteFolder | vscode.Uri) => {
			let folderUri: vscode.Uri | undefined;
			
			if (itemOrUri) {
				if (itemOrUri instanceof vscode.Uri) {
					folderUri = itemOrUri;
				} else if ((itemOrUri as FavoriteFolder).item) {
					const item = (itemOrUri as FavoriteFolder).item;
					if (typeof item === 'object') {
						// Virtual folder - toggle expansion? 
						// VS Code handles click to toggle expansion natively.
						// We don't need to do anything.
						return;
					} else {
						folderUri = vscode.Uri.parse(item);
					}
				} else if ((itemOrUri as any).resourceUri) {
					folderUri = (itemOrUri as any).resourceUri;
				}
			}

			if (folderUri) {
				const workspaceFolders = vscode.workspace.workspaceFolders;
				const isInWorkspace = workspaceFolders && workspaceFolders.some(f => {
					const folderPath = f.uri.fsPath;
					const targetPath = folderUri!.fsPath;
					return targetPath === folderPath || targetPath.startsWith(folderPath + path.sep);
				});
				if (isInWorkspace) {
					await vscode.commands.executeCommand('revealInExplorer', folderUri);
				} else {
					await vscode.commands.executeCommand('vscode.openFolder', folderUri, { forceNewWindow: true });
				}
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('favorite-folders.refresh', () => {
			provider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('favorite-folders.showContextMenu', async (itemOrUri?: FavoriteFolder | vscode.Uri) => {
			let folderUri: vscode.Uri | undefined;
			let isVirtual = false;
			let itemName = '';

			if (itemOrUri) {
				if (itemOrUri instanceof vscode.Uri) {
					folderUri = itemOrUri;
					itemName = path.basename(folderUri.fsPath);
				} else if ((itemOrUri as FavoriteFolder).item) {
					const item = (itemOrUri as FavoriteFolder).item;
					if (typeof item === 'object') {
						isVirtual = true;
						itemName = item.name;
					} else {
						folderUri = vscode.Uri.parse(item);
						itemName = path.basename(folderUri.fsPath);
					}
				} else if ((itemOrUri as any).resourceUri) {
					folderUri = (itemOrUri as any).resourceUri;
					itemName = path.basename(folderUri!.fsPath);
				}
			}

			if (!folderUri && !isVirtual) {
				vscode.window.showWarningMessage('No folder selected.');
				return;
			}

			const actions = [
				{ label: '$(trashcan) Remove Folder', action: 'favorite-folders.removeFolder' }
			];
			
			if (!isVirtual) {
				actions.unshift({ label: '$(folder-opened) Open Folder', action: 'favorite-folders.openFolder' });
			} else {
				actions.push({ label: '$(new-folder) Create Virtual Folder Inside', action: 'favorite-folders.createVirtualFolder' });
			}

			const pick = await vscode.window.showQuickPick(actions, { placeHolder: `Select an action for ${itemName}` });
			if (pick) {
				// Pass the original item context to the command
				await vscode.commands.executeCommand(pick.action, itemOrUri);
			}
		})
	);
}

// This method is called when your extension is deactivated
export function deactivate() { }
