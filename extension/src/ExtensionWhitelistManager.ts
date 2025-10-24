import * as vscode from "vscode";
import { Constants } from "./Constants";

/**
 * Manages the whitelist of extensions that are allowed to be updated or installed from the public marketplace.
 * It tracks extensions installed by the private marketplace and updates the user's "extensions.allowed" setting accordingly.
 * The refresh logic in run on startup and whenever an extension is installed or updated to avoid tampering.
 */
export class ExtensionWhitelistManager {
    private installedByPrivateMarketplace = new Set<string>();
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Tracks an extension that was installed by the private marketplace.
     * @param extensionId The ID of the extension that was installed by the private marketplace.
     */
    public trackPrivateInstall(extensionId: string) {
        this.installedByPrivateMarketplace.add(extensionId);
        this.refreshAllowedExtensions();
    }

    /**
     * Exposes the update whitelists methods to allow updating all whitelists at once.
     * @param extensionIds An array of extension IDs to add to the whitelist.
     * @param extraWhitelist An array of extension IDs to add to the extra whitelist.
     * @param allowAllVersions An array of extension IDs for which all versions should be allowed.
     */
    public async updateAllWhitelists(
        extensionIds: string[],
        extraWhitelist: string[] = [],
        allowAllVersions: string[] = []
    ) {
        if (extensionIds && extensionIds.length > 0) {
            await this.updateWhitelist(extensionIds);
        }
        await this.updateExtraWhitelist(extraWhitelist);
        await this.updateAllowAllVersions(allowAllVersions);
        await this.refreshAllowedExtensions();
    }

    /**
     * Updates the extra whitelist of extensions that are allowed to be updated or installed from the public marketplace.
     * This is used for extensions that have not got approved package downloads (due to various reasons) but are still allowed to be downloaded.
     * @param extraWhitelist An array of extension IDs to add to the extra whitelist.
     */
    private async updateExtraWhitelist(extraWhitelist: string[]) {
        await this.context.globalState.update(
            Constants.EXTRA_WHITELIST_KEY,
            Array.from(new Set(extraWhitelist.map(id => id.toLowerCase())))
        );
    }

    /**
     * @returns An array of extension IDs that are in the extra whitelist.
     */
    private getExtraWhitelist(): string[] {
        return this.context.globalState.get<string[]>(Constants.EXTRA_WHITELIST_KEY) || [];
    }

    /**
     * Updates the list of extension IDs for which all versions should be allowed.
     * This is typically for extensions that update very frequently and/or version mismatches are highly dependent on the VSC version.
     * @param allowAll An array of extension IDs for which all versions should be allowed.
     */
    private async updateAllowAllVersions(allowAll: string[]) {
        await this.context.globalState.update(
            Constants.ALLOW_ALL_KEY,
            Array.from(new Set(allowAll.map(id => id.toLowerCase())))
        );
    }

    /**
     * @returns An array of extension IDs for which all versions are allowed.
     */
    private getAllowAllVersions(): string[] {
        return this.context.globalState.get<string[]>(Constants.ALLOW_ALL_KEY) || [];
    }

    /**
     * Updates the whitelist of extensions that are allowed to be updated or installed from the public marketplace.
     * It will also remove duplicates from the whitelist (due to being a map).
     * @param extensionIds An array of extension IDs to add to the whitelist.
     */
    private async updateWhitelist(extensionIds: string[]) {
        await this.context.globalState.update(
            Constants.EXTENSION_WHITELIST_KEY,
            Array.from(new Set(extensionIds.map(id => id.toLowerCase())))
        );
    }

    /**
     * Gets the current whitelist of extensions that are allowed to be updated or installed from the public marketplace,
     * along with their versions if available.
     * @returns Array of [extension ID (lowercase), version] pairs.
     */
    private getWhitelist(): [string, string][] {
        const state = this.context.globalState.get<string[]>(Constants.EXTENSION_WHITELIST_KEY) || [];
        const extraWhitelist = this.getExtraWhitelist();
        
        // Combine and deduplicate all IDs
        const allIds = Array.from(new Set([...state, ...extraWhitelist])).map(id => id.toLowerCase());
        
        let whitelist: [string, string][] = [];
        for (const id of allIds) {
            // Skip empty strings
            if (!id || id.trim() === '') {
                continue;
            }
            
            // Match version number (e.g., -2.4.0) at the end, possibly followed by platform (e.g., -win32-x64)
            // This regex ensures we only match semantic versions at the end of the string
            const versionMatch = id.match(/-(\d+\.\d+\.\d+)(?:-[^-]*)*$/);
            if (versionMatch) {
                // Remove version and any trailing platform from id
                const extNameNoVersion = id.substring(0, versionMatch.index);
                whitelist.push([extNameNoVersion, versionMatch[1]]);
            } else {
                // No version found, just use the ID as is
                whitelist.push([id, ""]);
            }
        }
        
        // Remove duplicates based on extension name (first element of tuple)
        const seen = new Set<string>();
        const deduplicatedWhitelist: [string, string][] = [];
        
        for (const [name, version] of whitelist) {
            if (!seen.has(name)) {
                seen.add(name);
                deduplicatedWhitelist.push([name, version]);
            }
        }
        
        return deduplicatedWhitelist;
    }

    /**
     * Updates the user's "extensions.allowed" setting with the new configuration.
     * @param newSetting The new setting to update the "extensions.allowed" configuration.
     */
    private async updateAllowedExtensionsSettings(newSetting: any) {
        await vscode.workspace.getConfiguration().update(
            "extensions.allowed",
            newSetting,
            vscode.ConfigurationTarget.Global
        );
    }

    /**
     * Gets the current installed extensions and their versions.
     * @returns A record mapping extension IDs to their versions.
     */
    private getCurrentExtensions(): Record<string, string> {
        const map: Record<string, string> = {};
        for (const ext of vscode.extensions.all) {
            map[ext.id] = ext.packageJSON.version;
        }
        return map;
    }

    /**
     * Updates the user's "extensions.allowed" setting to allow only whitelisted and extensions installed from private marketplace.
     * Generally tracks the allowed versions of each approved extension, with a few caveats:
     * - If the extension is in the whitelist with an empty version, it allows all versions.
     * - If the extension is in the allow all versions list, it allows all versions.
     * - If the extension is installed but not in the whitelist, it explictly blocks the extension (to prevent tamper cases).
     * - If the extension is already installed but a new version is on the whitelist, it allows both the old and new versions.
     *   This is to prevent the case where fetching the updated whitelist removes old version from allowed list,
     *   which would not allow the user to use the extension until they manually cleared it, which would be a huge pain.
     * - If there is no whitelist or the whitelist is empty, it allows all extensions, i.e. during the first time use of the extension.
     */
    public async refreshAllowedExtensions() {
        await this.context.globalState.update(Constants.KNOWN_EXTENSIONS_KEY, this.getCurrentExtensions());

        const whitelist = this.getWhitelist();
        if (whitelist.length <= this.getExtraWhitelist().length || this.context.globalState.get('vscode-private-marketplace.debug', false)) {
            await this.updateAllowedExtensionsSettings("*");
            this.installedByPrivateMarketplace.clear();
            return;
        }

        const allowAllVersions = this.getAllowAllVersions();
        const currentExtensions = this.getCurrentExtensions();
        const allowed: Record<string, any> = {};
        const currentAllowedExtensions = vscode.workspace.getConfiguration().get<Record<string, any>>("extensions.allowed") || {};

        for (let [name, allowedVersion] of whitelist) {
            // Check for exact match first, then substring match
            let matchingExtension = Object.entries(currentExtensions).find(([id]) => 
                id.toLowerCase() === name.toLowerCase()
            );
            
            // If no exact match, try substring matching for backwards compatibility
            if (!matchingExtension) {
                matchingExtension = Object.entries(currentExtensions).find(([id]) => 
                    id.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(id.toLowerCase())
                );
            }

            if (matchingExtension) {
                let [id, version] = matchingExtension;
                id = id.toLowerCase();

                if (allowAllVersions.includes(id) || allowAllVersions.includes(name)) {
                    // Allow all versions for extensions in ALLOW_ALL_VERSIONS
                    allowed[id] = true;
                } else if (allowedVersion === "") {
                    // Allow all versions if the whitelist specifies an empty version
                    allowed[id] = true;
                } else if (version === allowedVersion) {
                    // Allow the specific version from the whitelist
                    allowed[id] = [allowedVersion];
                } else if (version.endsWith('-SNAPSHOT')) {
                    // Allow SNAPSHOT versions (these are testing versions for some extensions that are not publicly available)
                    allowed[id] = true;
                } else {
                    // For version mismatches, check if we should preserve the installed version
                    const currentAllowedVersion = currentAllowedExtensions[id] || currentAllowedExtensions[name];
                    if (Array.isArray(currentAllowedVersion) && currentAllowedVersion.includes(version)) {
                        // Version is already in rolling list, preserve it and add new version
                        allowed[id] = Array.from(new Set([...currentAllowedVersion, allowedVersion]));
                    } else {
                        // Create new rolling list with both versions
                        allowed[id] = Array.from(new Set([version, allowedVersion]));
                    }
                }
            } else {
                // If the extension is not installed, allow it based on the whitelist
                allowed[name] = allowedVersion === "" ? true : [allowedVersion];
            }

            // Handle rolling list of versions - but only if not in allowAllVersions
            const matchingExtensionId = matchingExtension?.[0]?.toLowerCase();
            const currentAllowedVersion = currentAllowedExtensions[name] || (matchingExtensionId ? currentAllowedExtensions[matchingExtensionId] : undefined);
            if (Array.isArray(currentAllowedVersion)) {
                const extensionId = matchingExtensionId || name;
                if (!(allowAllVersions.includes(extensionId) || allowAllVersions.includes(name))) {
                    // Merge the new whitelist version with the existing allowed versions & installed version
                    const versionsToMerge = [...currentAllowedVersion, allowedVersion];
                    if (matchingExtension && matchingExtension[1]) {
                        versionsToMerge.push(matchingExtension[1]);
                    }
                    
                    allowed[extensionId] = Array.from(new Set(versionsToMerge.filter(v => v !== "")));
                }
            }
        }

        // Block extensions that are installed but not on the whitelist
        for (let originalId of Object.keys(currentExtensions)) {
            const id = originalId.toLowerCase();
            
            // Skip if already processed
            if (allowed[id] !== undefined) continue;
            
            // Don't block VS Code built-ins
            if (id.startsWith('vscode.')) continue;
            
            // Don't block extensions in allowAllVersions
            if (allowAllVersions.includes(id)) {
                allowed[id] = true;
                continue;
            }
            
            // Don't block SNAPSHOT versions
            if (currentExtensions[originalId].endsWith('-SNAPSHOT')) {
                allowed[id] = true;
                continue;
            }
            
            // Block this extension
            allowed[id] = false;
        }

        // Update the user's settings
        await this.updateAllowedExtensionsSettings(allowed);

        // Update stored state and clear private install tracking
        await this.context.globalState.update(Constants.KNOWN_EXTENSIONS_KEY, currentExtensions);
        this.installedByPrivateMarketplace.clear();
    }
}