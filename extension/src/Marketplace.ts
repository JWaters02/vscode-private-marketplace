import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { Utils } from "./utils";
import { Constants } from "./Constants";
import { ExtensionEntry, ExtensionJson, ConfigVersions } from "./Types";

/**
 * Represents a tree item in the extension marketplace
 */
class MarketplaceTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly command?: vscode.Command,
        public readonly extensionData?: any,
        public readonly description?: string,
        public readonly iconPath?: vscode.ThemeIcon,
    ) {
        super(label, collapsibleState);
        if (description) this.description = description;
        if (iconPath) this.iconPath = iconPath;
        if (command) this.command = command;
    }
}

/**
 * Provides the tree data for the extension marketplace
 */
export class ExtensionMarketplaceProvider implements vscode.TreeDataProvider<MarketplaceTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<MarketplaceTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private context: vscode.ExtensionContext;
    private previousExtensions: Record<string, string> = {};
    private updatedExtensions: { ext: ExtensionEntry, prevVersion?: string, newVersion: string }[] = [];
    private currentVersions: ConfigVersions = { zoweConfig: 0, zoweSchema: 0 };
    public extensionJson: ExtensionJson | null = null;
    public branch: string;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        const testModeEnabled = context.globalState.get<boolean>(Constants.TEST_MODE_KEY) ?? false;
        this.branch = testModeEnabled ? Constants.AZURE_BRANCH_TEST : Constants.AZURE_BRANCH_MAIN;
        this.previousExtensions = context.globalState.get<Record<string, string>>(Constants.KNOWN_EXTENSIONS_KEY) || {};
        this.currentVersions = context.globalState.get<ConfigVersions>(Constants.CONFIG_VERSIONS_KEY) || { zoweConfig: 0, zoweSchema: 0 };
    }

    /**
     * Gets the tree item for a given element
     * @param element The element to get the tree item for
     * @returns The tree item for the element
     */
    getTreeItem(element: MarketplaceTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Gets the children of a given element
     * If no element is provided, returns the top-level categories or a fetch button if no extensionJson is loaded.
     * If categories are clicked, returns the extensions in that category.
     * @param element The element to get the children for, or undefined for top-level categories
     * @returns A promise that resolves to an array of MarketplaceTreeItem objects representing the children
     * @throws Will throw an error if the extensionJson is not loaded and no fetch button is available.
     */
    getChildren(element?: MarketplaceTreeItem): Thenable<MarketplaceTreeItem[]> {
        // Show fetch button if no extensionJson is loaded yet
        if (!this.extensionJson) {
            return Promise.resolve([
                new MarketplaceTreeItem(
                    "Fetch Extension List",
                    vscode.TreeItemCollapsibleState.None,
                    "fetchExtensionJson",
                    {
                        command: "vscode-private-marketplace.fetchExtensionJson",
                        title: "Fetch Extension List"
                    },
                    undefined,
                    undefined,
                    new vscode.ThemeIcon("cloud-download")
                )
            ]);
        }

        // Get categories nodes for the top level tree nodes
        if (element && element.contextValue === "category-approved") {
            return this.getCategoryNodes(Constants.APPROVED_EXTENSIONS);
        }
        if (element && element.contextValue === "category-updated") {
            return this.getCategoryNodes(Constants.UPDATED_EXTENSIONS);
        }
        // If a category node is clicked, show its extensions
        if (element && element.contextValue === "extension-category" && element.extensionData.parentType === Constants.APPROVED_EXTENSIONS) {
            return this.getExtensionsForCategory(element.extensionData.parentType, element.extensionData.category);
        }
        if (element && element.contextValue === "extension-category" && element.extensionData.parentType === Constants.UPDATED_EXTENSIONS) {
            return this.getExtensionsForCategory(element.extensionData.parentType, element.extensionData.category);
        }

        // Show extensions in the tree for approved and updated categories
        const items: MarketplaceTreeItem[] = [];
        const approved = this.extensionJson.approvedExtensions || [];
        this.updatedExtensions = this.getUpdatedExtensions();
        if (approved.length > 0) {
            items.push(new MarketplaceTreeItem("Approved Extensions", vscode.TreeItemCollapsibleState.Expanded, "category-approved"));
        } else {
            items.push(new MarketplaceTreeItem("No Approved Extensions", vscode.TreeItemCollapsibleState.None, "no-approved-extensions"));
        }

        if (this.updatedExtensions.length > 0) {
            items.push(new MarketplaceTreeItem("Updated Extensions", vscode.TreeItemCollapsibleState.Collapsed, "category-updated"));
        }

        const configFetchButtons = this.shouldShowConfigFetchButtons();
        if (configFetchButtons.zoweConfig || configFetchButtons.zoweSchema) {
            if (configFetchButtons.zoweConfig) {
                items.push(new MarketplaceTreeItem(
                    "Download Updated Config JSON",
                    vscode.TreeItemCollapsibleState.None,
                    "download-config-json",
                    {
                        command: "vscode-private-marketplace.downloadZoweConfig",
                        title: "Download Config JSON",
                        arguments: [Utils.getConfigDownloadUrl(Constants.ZOWE_CONFIG_JSON_FILENAME, this.branch)]
                    },
                    undefined,
                    undefined,
                    new vscode.ThemeIcon("cloud-download")
                ));
            }
            if (configFetchButtons.zoweSchema) {
                items.push(new MarketplaceTreeItem(
                    "Download Updated Schema JSON",
                    vscode.TreeItemCollapsibleState.None,
                    "download-schema-json",
                    {
                        command: "vscode-private-marketplace.downloadZoweSchema",
                        title: "Download Schema JSON",
                        arguments: [Utils.getConfigDownloadUrl(Constants.ZOWE_SCHEMA_JSON_FILENAME, this.branch)]
                    },
                    undefined,
                    undefined,
                    new vscode.ThemeIcon("cloud-download")
                ));
            }
        }

        return Promise.resolve(items);
    }

    /**
     * Gets the category nodes for either approved or updated extensions.
     * @param parentType The type of extensions to get categories for, either APPROVED_EXTENSIONS or UPDATED_EXTENSIONS.
     * @returns A promise that resolves to an array of MarketplaceTreeItem objects representing the categories.
     * @throws Will throw an error if the extensionJson is not loaded.
     */
    private async getCategoryNodes(parentType: typeof Constants.APPROVED_EXTENSIONS | typeof Constants.UPDATED_EXTENSIONS): Promise<MarketplaceTreeItem[]> {
        if (!this.extensionJson) return [];
        let arr: ExtensionEntry[] = [];
        if (parentType === Constants.APPROVED_EXTENSIONS) {
            arr = this.extensionJson.approvedExtensions || [];
        } else if (parentType === Constants.UPDATED_EXTENSIONS) {
            arr = this.updatedExtensions.map(ext => ({
                ...ext.ext,
                packageName: ext.ext.packageName,
                version: ext.newVersion
            }));
        }
        if (arr.length === 0) {
            return [new MarketplaceTreeItem("No Extensions Found", vscode.TreeItemCollapsibleState.None, "no-extensions")];
        }

        // Group by category
        const categories = Array.from(new Set(arr.map(ext => ext.category || "Other")));
        return categories.map(category =>
            new MarketplaceTreeItem(
                category,
                vscode.TreeItemCollapsibleState.Collapsed,
                "extension-category",
                undefined,
                { category, parentType },
                undefined,
                new vscode.ThemeIcon("folder-library")
            )
        );
    }

    /**
     * Gets the extensions for a specific category.
     * @param parentType The type of extensions to get, either APPROVED_EXTENSIONS or UPDATED_EXTENSIONS.
     * @param category The category to filter extensions by.
     * @returns A promise that resolves to an array of MarketplaceTreeItem objects representing the extensions in the specified category.
     */
    private async getExtensionsForCategory(parentType: typeof Constants.APPROVED_EXTENSIONS | typeof Constants.UPDATED_EXTENSIONS, category: string): Promise<MarketplaceTreeItem[]> {
        if (!this.extensionJson) return [];
        const folder = this.extensionJson.approvedExtensionsPath;
        let arr: ExtensionEntry[] = [];
        if (parentType === Constants.APPROVED_EXTENSIONS) {
            arr = this.extensionJson.approvedExtensions.filter(ext => (ext.category || "Other") === category);
        } else if (parentType === Constants.UPDATED_EXTENSIONS) {
            const updatedExtensions = this.updatedExtensions.filter(ext => (ext.ext.category || "Other") === category);
            arr = updatedExtensions.map(ext => ({
                ...ext.ext,
                packageName: ext.ext.packageName,
                version: ext.newVersion
            }));
        }
        return arr.map(ext => {
            const versionMatch = ext.packageName.match(/(\d+\.\d+\.\d+)/);
            const version = versionMatch ? versionMatch[1] : "unknown";
            let description = version;

            if (parentType === Constants.UPDATED_EXTENSIONS) {
                const updatedExt = this.updatedExtensions.find(e => e.ext.packageName === ext.packageName);
                if (updatedExt) {
                    description = `${updatedExt.prevVersion || "new"} → ${version}`;
                }
            }

            return new MarketplaceTreeItem(
                `${ext.name}`,
                vscode.TreeItemCollapsibleState.None,
                "extension-downloadable",
                undefined,
                { ...ext, version, downloadURL: Utils.getVsixDownloadUrl(ext.packageName, this.branch, folder) },
                description,
                new vscode.ThemeIcon("cloud-download")
            );
        });
    }

    /**
     * Gets the updated extensions by comparing the current extension.json with the previous known extensions.
     * @returns An array of objects representing updated extensions, each containing the extension entry, previous version, and new version.
     */
    private getUpdatedExtensions(): { ext: ExtensionEntry, prevVersion?: string, newVersion: string }[] {
        if (!this.extensionJson) return [];
        const current = this.extensionJson.approvedExtensions || [];
        // Lowercase all previous extension keys for comparison
        const prevKeys = Object.keys(this.previousExtensions).reduce<Record<string, string>>((acc, k) => {
            acc[k.toLowerCase()] = this.previousExtensions[k];
            return acc;
        }, {});
        return current
            .map(ext => {
                const versionMatch = ext.packageName.match(/(\d+\.\d+\.\d+)/);
                const version = versionMatch ? versionMatch[1] : undefined;
                // Lowercase for comparison
                const extName = ext.packageName.toLowerCase();
                let prevVersion: string | undefined;
                if (prevKeys[extName]) {
                    prevVersion = prevKeys[extName];
                } else {
                    // Try to match by just ext-name-x.y.z (strip org if present in previousExtensions)
                    const extNameNoVersion = extName.replace(/-\d+\.\d+\.\d+$/, "");
                    const extNameNoOrg = extNameNoVersion.includes('.') ? extNameNoVersion.substring(extNameNoVersion.indexOf('.') + 1) : extNameNoVersion;
                    const prevKey = Object.keys(prevKeys).find(k => k.endsWith(extNameNoOrg));
                    if (prevKey) {
                        prevVersion = prevKeys[prevKey];
                    }
                }
                return {
                    ext,
                    prevVersion,
                    newVersion: version ?? "unknown"
                };
            })
            // Only include extensions that have a previous version and the version has changed
            .filter(item => item.prevVersion && item.prevVersion !== item.newVersion);
    }

    /**
     * Determines whether to show the configuration fetch buttons.
     * @returns An object indicating whether to show the Zowe configuration and schema fetch buttons.
     */
    private shouldShowConfigFetchButtons(): { zoweConfig: boolean, zoweSchema: boolean } {
        const versions = this.getConfigFilesVersions();
        return {
            zoweConfig: versions.zoweConfig < this.currentVersions.zoweConfig,
            zoweSchema: versions.zoweSchema < this.currentVersions.zoweSchema
        };
    }

    /**
     * Gets the versions of the Zowe configuration files.
     * @returns An object containing the versions of the Zowe configuration files.
     */
    private getConfigFilesVersions(): ConfigVersions {
        const zoweFolder = Utils.getZoweFolder();
        const configFiles = [
            path.join(zoweFolder, Constants.ZOWE_CONFIG_JSON_FILENAME),
            path.join(zoweFolder, Constants.ZOWE_SCHEMA_JSON_FILENAME),
        ];
        const versions: ConfigVersions = { zoweConfig: 0, zoweSchema: 0 };
        for (const file of configFiles) {
            if (fs.existsSync(file)) {
                const version = this.getFileVersion(file);
                if (file.endsWith(Constants.ZOWE_CONFIG_JSON_FILENAME)) {
                    versions.zoweConfig = version || 0;
                } else if (file.endsWith(Constants.ZOWE_SCHEMA_JSON_FILENAME)) {
                    versions.zoweSchema = version || 0;
                }
            }
        }
        return versions;
    }

    /**
     * Reads the version number from a JSON file.
     * @param filePath The path to the file to read the version from.
     * @returns The version number from the file, or undefined if the file cannot be read or does not contain a version.
     */
    private getFileVersion(filePath: string): number | undefined {
        try {
            const raw = fs.readFileSync(filePath, "utf8");
            const json = JSON.parse(raw);
            return json["vscode-internal-version"];
        } catch (e) {
            return undefined;
        }
    }

    /**
     * Fetches the extension.json file from Azure DevOps, waits for the user to download it, and loads it into the provider.
     * This method will delete any existing extension.json file in the Downloads folder before prompting the user to download the new one.
     * It will also parse the JSON and set it in the provider.
     * If the file is not found after 30 seconds, it will show a warning message.
     * @returns A promise that resolves when the extension.json is successfully fetched and loaded.
     * @throws Will show an error message if the JSON cannot be parsed.
     * @throws Will show a warning message if the file is not found after 30 seconds.
     * @throws Will show an error message if there is an issue reading or parsing the file.
     */
    async fetchAndLoadExtensionJson(): Promise<void> {
        // First delete any existing extension.json in Downloads
        Utils.deleteFileIfExists(Constants.EXTENSION_JSON_FILENAME);

        // Open the download URL in the browser and wait for user to download
        const url = Utils.getExtensionJsonDownloadUrl(this.branch);
        vscode.env.openExternal(vscode.Uri.parse(url));
        const jsonPath = await Utils.pollDownloadedFile(Constants.EXTENSION_JSON_FILENAME);
        if (!jsonPath) {
            vscode.window.showWarningMessage(`${Constants.EXTENSION_JSON_FILENAME} was not found in your Downloads folder after 30 seconds. Perhaps try again?`);
            return;
        }
        try {
            const raw = fs.readFileSync(jsonPath, "utf8");
            const json = JSON.parse(raw);
            this.setExtensionJson(json);
            this.updateConfigVersions(json);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to parse ${Constants.EXTENSION_JSON_FILENAME}: ` + (e.message || e.toString()));
        }
    }

    /**
     * Sets the extension.json data in the provider and refreshes the tree view.
     * This method should be called after successfully fetching and parsing the extension.json file.
     * It will update the internal state and trigger a refresh of the tree data.
     * @param json The parsed JSON object representing the extension.json file.
     */
    setExtensionJson(json: ExtensionJson) {
        this.extensionJson = json;
        this._onDidChangeTreeData.fire();
    }

    /**
     * Updates the global state with the config versions from the extensionJson file.
     * @param json The parsed extensionJson file.
     */
    private updateConfigVersions(json: ExtensionJson): void {
        const zoweConfigVersion = json.zoweConfigVersion || 0;
        const zoweSchemaVersion = json.zoweSchemaVersion || 0;

        this.currentVersions = { zoweConfig: zoweConfigVersion, zoweSchema: zoweSchemaVersion };
        this.context.globalState.update(Constants.CONFIG_VERSIONS_KEY, this.currentVersions);
    }

    /**
     * Toggles the test mode branch between main and test.
     * This method will switch the branch used for fetching the extension.json file.
     * It will also reset the extensionJson to null and refresh the tree data.
     * @returns void
     */
    toggleTestMode() {
        this.branch = this.branch === Constants.AZURE_BRANCH_MAIN ? Constants.AZURE_BRANCH_TEST : Constants.AZURE_BRANCH_MAIN;
        this.extensionJson = null;
        this._onDidChangeTreeData.fire();
    }

    /**
     * Refreshes the tree view by firing the onDidChangeTreeData event
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Gets the current config versions
     * @returns The current config versions for zowe config and schema
     */
    public getConfigVersions(): ConfigVersions {
        return this.currentVersions;
    }
}