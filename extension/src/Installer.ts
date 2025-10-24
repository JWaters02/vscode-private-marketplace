import * as vscode from "vscode";
import * as path from "path";
import { Utils } from "./utils";
import { GeneratedExtensionEntry } from "./Types";

/**
 * Installs a VSIX extension from a downloaded file or URL.
 */
export class ExtensionInstaller {
    /**
     * Polls the Downloads folder for a VSIX file matching the extension's packageName.
     * @param extension The extension entry containing the packageName.
     * @param timeoutMs Maximum time to wait for the file to appear, in milliseconds.
     * @param pollIntervalMs Time interval to poll for the file, in milliseconds.
     * @returns The full path to the downloaded VSIX file if found, or undefined if not found within the timeout.
     * @throws Will show an error message if the extension packageName is missing or invalid.
     */
    static async pollForVsix(extension: GeneratedExtensionEntry, timeoutMs = 30000, pollIntervalMs = 1000): Promise<string | undefined> {
        if (!extension || !extension.packageName) {
            vscode.window.showErrorMessage("Extension packageName is missing or invalid. Cannot search for VSIX file.");
            return undefined;
        }
        const filename = `${extension.packageName}.vsix`;
        return await Utils.pollDownloadedFile(filename, timeoutMs, pollIntervalMs);
    }

    /**
     * Installs a VSIX file from the specified path and shows a message to the user.
     * If the installation is successful, it prompts the user to open the extension in the extensions view.
     * If the user has opted to hide this message, it will not show the prompt.
     * @param vsixPath The full path to the VSIX file to install.
     * @param extensionName The name of the extension being installed, used for display purposes.
     * @throws Will show an error message if the installation fails.
     */
    static async installVsixFromFile(vsixPath: string, extensionName: string) {
        vscode.window.showInformationMessage(`Installing ${extensionName}, this may take a minute...`);
        try {
            await vscode.commands.executeCommand("workbench.extensions.installExtension", vscode.Uri.file(vsixPath));
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to install ${extensionName}: ${err.message || err}`);
            return;
        }

        // Show message to user about successful installation
        const hide = vscode.workspace.getConfiguration().get<boolean>('vscode-private-marketplace.hideVsixInstallMessage', false);
        if (hide) {
            vscode.window.showInformationMessage(`Installed ${extensionName} from ${vsixPath}.`);
            return;
        };
        const action = await vscode.window.showInformationMessage(
            `Installed extension from ${vsixPath}. Would you like to open the extension in the extensions view?`,
            "OK",
            "Dismiss",
            "Don't show again"
        );
        if (action === "OK") {
            await vscode.commands.executeCommand("workbench.extensions.search", extensionName);
        }
        if (action === "Don't show again") {
            await vscode.workspace.getConfiguration().update(
                'vscode-private-marketplace.hideVsixInstallMessage',
                true,
                vscode.ConfigurationTarget.Global
            );
        }
    }

    /**
     * This method will open the download URL in the browser, wait for the user to download the VSIX file,
     * and then install it from the Downloads folder.
     * It will poll the Downloads folder for the VSIX file matching the packageName.
     * If the file is found, it will install the VSIX file and show a message to the user.
     * If the file is not found within the timeout, it will show a warning message.
     * @param extension The extension entry containing the download URL and packageName.
     */
    static async downloadAndInstall(extension: GeneratedExtensionEntry) {
        // Check for existing .vsix file first (this shouldn't happen but just in case)
        const existingVsix = await ExtensionInstaller.pollForVsix(extension, 1000, 1000);
        if (existingVsix) {
            await ExtensionInstaller.installVsixFromFile(existingVsix, extension.name);
            return;
        }

        // Early return if extension is invalid
        if (!extension || !extension.downloadURL) {
            return;
        }

        // Prompt download and poll for new file
        vscode.env.openExternal(vscode.Uri.parse(extension.downloadURL));
        const vsixPath = await ExtensionInstaller.pollForVsix(extension);
        if (!vsixPath) {
            vscode.window.showWarningMessage(`${extension.name} was not found in your Downloads folder after 30 seconds. Please try again.`);
            return;
        }

        await ExtensionInstaller.installVsixFromFile(vsixPath, extension.name);
    }
}

export class ConfigInstaller {
    /**
     * Moves the validated configuration file from the Downloads folder to the Zowe configuration folder.
     * @param filePath The full path to the downloaded file.
     * @param targetFilename The name of the target file in the Zowe configuration folder.
     * @throws Will show an error message if the move operation fails.
     */
    static moveConfigFileToZoweFolder(filePath: string, targetFilename: string): void {
        const zoweFolder = Utils.getZoweFolder();
        const targetPath = path.join(zoweFolder, targetFilename);

        try {
            Utils.moveFile(filePath, targetPath);
            vscode.window.showInformationMessage(`Successfully moved ${targetFilename} to ${zoweFolder}.`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to move ${targetFilename} to ${zoweFolder}: ${err.message || err}`);
        }
    }

    /**
     * Checks for an existing valid config file first, then opens the download URL if needed, waits for the user to download the file with correct version, and moves it to the Zowe configuration folder.
     * @param filename The name of the file to download (e.g., `zowe.config.json` or `zowe.schema.json`).
     * @param url The download URL for the file.
     * @param expectedVersion The expected version number for validation.
     * @throws Will show a warning message if the file is not found or has incorrect version within the timeout.
     */
    static async downloadAndInstallConfig(filename: string, url: string, expectedVersion: number): Promise<void> {
        // First check if there's already a valid file in Downloads
        let downloadedFilePath = await Utils.pollAndValidateConfigFile(filename, expectedVersion, 1000, 1000);
        
        if (!downloadedFilePath) {
            // No valid file found, prompt user to download
            vscode.env.openExternal(vscode.Uri.parse(url));
            
            // Poll for the downloaded file with version validation (full timeout)
            downloadedFilePath = await Utils.pollAndValidateConfigFile(filename, expectedVersion);
        } else {
            vscode.window.showInformationMessage(`Found existing valid ${filename} in Downloads folder to use.`);
        }

        if (!downloadedFilePath) {
            vscode.window.showWarningMessage(
                `${filename} with the correct version (${expectedVersion}) was not found in your Downloads folder after 30 seconds. ` +
                `Please ensure you download the latest version or remove any old versions from your Downloads folder and try again.`
            );
            return;
        }

        ConfigInstaller.moveConfigFileToZoweFolder(downloadedFilePath, filename);
    }
}