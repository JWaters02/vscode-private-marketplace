import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { Constants } from "./Constants";

export class Utils {
    /**
     * Gets the Downloads folder path for the current user
     * If the `vscode-private-marketplace.overrideDownloadsPath` setting is set, it uses that path instead.
     * @returns The path to the Downloads folder
     */
    public static getDownloadsFolder(): string {
        const overridePath = vscode.workspace.getConfiguration().get<string>(Constants.OVERRIDE_DOWNLOADS_PATH_KEY);
        if (overridePath !== undefined && overridePath !== "") {
            return path.resolve(overridePath);
        }
        return path.join(os.homedir(), "Downloads");
    }

    /**
     * Gets the Zowe folder path for the current user
     * @returns The path to the Zowe folder in the user's .zowe directory
     */
    public static getZoweFolder(): string {
        return path.join(os.homedir(), ".zowe");
    }

    /**
     * Deletes a file in the Downloads folder if it exists
     * @param filePath The relative path of the file to delete in the Downloads folder
     */
    public static deleteFileIfExists(filePath: string): void {
        const existingPath = path.join(this.getDownloadsFolder(), filePath);
        if (fs.existsSync(existingPath)) {
            try {
                fs.unlinkSync(existingPath);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to delete existing file ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
                return;
            }
        }
    }

    /**
     * Constructs the Azure download URL for the extension.json file
     * @param branch The branch to fetch the extension.json from
     * @returns The URL to download the extension.json file
     */
    public static getExtensionJsonDownloadUrl(branch: string): string {
        return `${Constants.AZURE_REPO_BASE}/items?path=/${Constants.EXTENSION_JSON_FILENAME}${Constants.AZURE_URL_FLUFF}${branch}${Constants.AZURE_URL_END}`;
    }

    /**
     * Constructs the Azure download URL for an extension .vsix file
     * @param packageName The name of the package (can be with or without .vsix)
     * @param branch The branch to fetch the extension from
     * @param folder The folder path in the Azure repository where the .vsix file is located
     * @returns The URL to download the .vsix file
     */
    public static getVsixDownloadUrl(packageName: string, branch: string, folder: string): string {
        if (packageName.endsWith(".vsix")) {
            packageName = packageName.slice(0, -5); // Remove .vsix if present
        }
        return `${Constants.AZURE_REPO_BASE}/items?path=${folder}/${packageName}.vsix${Constants.AZURE_URL_FLUFF}${branch}${Constants.AZURE_URL_END}`;
    }

    /**
     * Constructs the Azure download URL for the zowe.config.json or zowe.schema.json files
     * @param filename The name of the file to download
     * @param branch The branch to fetch the file from
     * @returns The URL to download the file
     */
    public static getConfigDownloadUrl(filename: string, branch: string): string {
        return `${Constants.AZURE_REPO_BASE}/items?path=/${filename}${Constants.AZURE_URL_FLUFF}${branch}${Constants.AZURE_URL_END}`;
    }

    /**
     * Polls the Downloads folder for a file with the specified name
     * @param filename The name of the file to poll for in the Downloads folder
     * @param timeoutMs Maximum time to wait for the file to appear, in milliseconds
     * @param pollIntervalMs Time interval to poll for the file, in milliseconds
     * @returns The full path to the downloaded file if found, or undefined if not found within the timeout
     */
    public static async pollDownloadedFile(filename: string, timeoutMs = 30000, pollIntervalMs = 1000): Promise<string | undefined> {
        const downloadsFolder = this.getDownloadsFolder();
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const files = fs.readdirSync(downloadsFolder);
            const matchingFiles = files
                .filter(f => this.isMatchingDownloadFile(f, filename))
                .map(f => path.join(downloadsFolder, f));
            if (matchingFiles.length > 0) {
                matchingFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
                return matchingFiles[0];
            }
            await new Promise(res => setTimeout(res, pollIntervalMs));
        }
        return undefined;
    }

    /**
     * Polls for and validates config files, moving them instead of copying to prevent reuse of old versions
     * @param filename The name of the config file to poll for
     * @param expectedVersion The expected version number for validation
     * @param timeoutMs Maximum time to wait for the file to appear, in milliseconds
     * @param pollIntervalMs Time interval to poll for the file, in milliseconds
     * @returns The full path to the validated config file if found, or undefined if not found/invalid within timeout
     */
    public static async pollAndValidateConfigFile(filename: string, expectedVersion: number, timeoutMs = 30000, pollIntervalMs = 1000): Promise<string | undefined> {
        const downloadsFolder = this.getDownloadsFolder();
        const start = Date.now();
        
        while (Date.now() - start < timeoutMs) {
            const files = fs.readdirSync(downloadsFolder);
            const matchingFiles = files
                .filter(f => this.isMatchingDownloadFile(f, filename))
                .map(f => path.join(downloadsFolder, f));
                
            if (matchingFiles.length > 0) {
                // Sort by modification time (newest first)
                matchingFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
                
                // Check each file for version match
                for (const filePath of matchingFiles) {
                    try {
                        const content = fs.readFileSync(filePath, 'utf-8');
                        const configData = JSON.parse(content);
                        
                        // Check version based on filename
                        let actualVersion: number | undefined;
                        if (filename.toLowerCase().includes(Constants.ZOWE_CONFIG_JSON_FILENAME)) {
                            actualVersion = configData['vscode-internal-version'];
                        } else if (filename.toLowerCase().includes(Constants.ZOWE_SCHEMA_JSON_FILENAME)) {
                            actualVersion = configData['vscode-internal-version'];
                        }
                        
                        if (actualVersion === expectedVersion) {
                            return filePath;
                        }
                    } catch (err) {
                        // Skip files that can't be parsed as JSON or read
                        continue;
                    }
                }
            }
            
            await new Promise(res => setTimeout(res, pollIntervalMs));
        }
        
        return undefined;
    }

    /**
     * Moves a file from source to destination and deletes the source
     * @param sourcePath The path to the source file
     * @param destinationPath The path to the destination file
     * @throws Will throw an error if the move operation fails
     */
    public static moveFile(sourcePath: string, destinationPath: string): void {
        // Ensure destination directory exists
        const destinationDir = path.dirname(destinationPath);
        if (!fs.existsSync(destinationDir)) {
            fs.mkdirSync(destinationDir, { recursive: true });
        }
        
        // Copy then delete to ensure atomic operation
        fs.copyFileSync(sourcePath, destinationPath);
        fs.unlinkSync(sourcePath);
    }

    /**
     * Checks if a file matches the expected download filename, including Windows duplicate patterns
     * @param actualFilename The actual filename found in the downloads folder
     * @param expectedFilename The filename we're looking for
     * @returns True if the file matches the expected pattern
     */
    private static isMatchingDownloadFile(actualFilename: string, expectedFilename: string): boolean {
        const actualLower = actualFilename.toLowerCase();
        const expectedLower = expectedFilename.toLowerCase();
        
        // Exact match
        if (actualLower === expectedLower) {
            return true;
        }
        
        // Check for Windows duplicate pattern: "filename (n).ext"
        const lastDotIndex = expectedLower.lastIndexOf('.');
        if (lastDotIndex === -1) {
            // No extension - check for pattern "filename (n)"
            const duplicatePattern = new RegExp(`^${this.escapeRegex(expectedLower)} \\(\\d+\\)$`);
            return duplicatePattern.test(actualLower);
        } else {
            // Has extension - check for pattern "name (n).ext"
            const nameWithoutExt = expectedLower.substring(0, lastDotIndex);
            const extension = expectedLower.substring(lastDotIndex);
            const duplicatePattern = new RegExp(`^${this.escapeRegex(nameWithoutExt)} \\(\\d+\\)${this.escapeRegex(extension)}$`);
            return duplicatePattern.test(actualLower);
        }
    }
    
    /**
     * Escapes special regex characters in a string
     * @param str The string to escape
     * @returns The escaped string safe for use in regex
     */
    private static escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}