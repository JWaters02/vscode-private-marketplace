import * as vscode from "vscode";
import { ExtensionMarketplaceProvider } from "./Marketplace";
import { ExtensionWhitelistManager } from "./ExtensionWhitelistManager";
import { ExtensionInstaller, ConfigInstaller } from "./Installer";
import { Constants } from "./Constants";

/**
 * @description Registers extension marketplace related commands and providers
 * @param context The extension context
 */
function registerMarketplaceFeatures(context: vscode.ExtensionContext) {
    // Track extensions installed from this extension
    const whitelistManager = new ExtensionWhitelistManager(context);
    whitelistManager.refreshAllowedExtensions();

    // Register the extension marketplace provider and commands
    const provider = new ExtensionMarketplaceProvider(context);
    vscode.window.registerTreeDataProvider("vscode-approved-extensions", provider);

    context.subscriptions.push(
        vscode.commands.registerCommand("vscode-private-marketplace.fetchExtensionJson", async () => {
            await provider.fetchAndLoadExtensionJson();
            // Whitelist all extensions in the fetched list
            const allIds: string[] = [];
            if (provider.extensionJson) {
                const json = provider.extensionJson;
                if (json.approvedExtensions) {
                    allIds.push(...json.approvedExtensions.map((e: any) => e.packageName.replace(/\.vsix$/i, '').toLowerCase()));
                }
            }
            await whitelistManager.updateAllWhitelists(
                allIds,
                provider.extensionJson?.extraWhitelist || [],
                provider.extensionJson?.allowAllVersions || []
            )
            await whitelistManager.refreshAllowedExtensions();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("vscode-private-marketplace.toggleTestMode", async () => {
            provider.toggleTestMode();
            await context.globalState.update(Constants.TEST_MODE_KEY, provider.branch === Constants.AZURE_BRANCH_TEST);
            vscode.window.showInformationMessage(
                `Test Mode is now ${provider.branch === Constants.AZURE_BRANCH_TEST ? "ON" : "OFF"}`
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("vscode-private-marketplace.debug", async () => {
            const currentState = context.globalState.get('vscode-private-marketplace.debug', false);
            await context.globalState.update('vscode-private-marketplace.debug', !currentState);
            vscode.window.showInformationMessage(
                `debug is now ${currentState ? "OFF" : "ON"}`
            );
            await whitelistManager.refreshAllowedExtensions();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("vscode-private-marketplace.downloadExtension", async (item) => {
            if (item && item.extensionData) {
                whitelistManager.trackPrivateInstall(item.extensionData.id);
                await ExtensionInstaller.downloadAndInstall(item.extensionData);
            } else {
                vscode.window.showErrorMessage("No extension data found for download.");
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("vscode-private-marketplace.queryExtension", async (item) => {
            if (item && item.extensionData && item.extensionData.name) {
                await vscode.commands.executeCommand("workbench.extensions.search", item.extensionData.name);
            } else {
                vscode.window.showErrorMessage("No extension data found for query.");
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("vscode-private-marketplace.downloadZoweConfig", async (url: string) => {
            const configVersion = provider.getConfigVersions().zoweConfig;
            await ConfigInstaller.downloadAndInstallConfig(Constants.ZOWE_CONFIG_JSON_FILENAME, url, configVersion);
            provider.refresh();
        })
    )

    context.subscriptions.push(
        vscode.commands.registerCommand("vscode-private-marketplace.downloadZoweSchema", async (url: string) => {
            const schemaVersion = provider.getConfigVersions().zoweSchema;
            await ConfigInstaller.downloadAndInstallConfig(Constants.ZOWE_SCHEMA_JSON_FILENAME, url, schemaVersion);
            provider.refresh();
        })
    );
}

/**
 * @description Activates the extension and registers the commands
 * @param context The extension context
 */
export function activate(context: vscode.ExtensionContext): void {
    registerMarketplaceFeatures(context);
}

/**
 * @description Deactivates the extension
 * @param _context The extension context
 */
export function deactivate(_context: vscode.ExtensionContext): void {}

module.exports = {
    activate,
    deactivate
};