import * as vscode from 'vscode';
import { ExtensionInstaller } from '../Installer';
import { Utils } from '../utils';
import { GeneratedExtensionEntry } from '../Types';

jest.mock('vscode');
jest.mock('fs');
jest.mock('path');
jest.mock('../utils');

// Mock modules with proper types
const mockUtils = Utils as jest.Mocked<typeof Utils>;

// Access the mocked vscode functions
const mockWindow = vscode.window as jest.Mocked<typeof vscode.window>;
const mockWorkspace = vscode.workspace as jest.Mocked<typeof vscode.workspace>;
const mockCommands = vscode.commands as jest.Mocked<typeof vscode.commands>;
const mockEnv = vscode.env as jest.Mocked<typeof vscode.env>;
const mockUri = vscode.Uri as jest.Mocked<typeof vscode.Uri>;

describe('ExtensionInstaller', () => {
    const mockExtension: GeneratedExtensionEntry = {
        name: 'Test Extension',
        packageName: 'test.extension-1.0.0',
        category: 'Testing',
        version: '1.0.0',
        downloadURL: 'https://dev.azure.com/vscode-Technology/22844d09-29df-4b0c-bff7-39ad061d525a/_apis/git/repositories/18f48cff-f1fe-4f8e-a761-95d74340cb8d/items?path=/approved/test.extension-1.0.0.vsix&versionDescriptor%5BversionOptions%5D=0&versionDescriptor%5BversionType%5D=0&versionDescriptor%5Bversion%5D=main&resolveLfs=true&%24format=octetStream&api-version=5.0&download=true'
    };

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Setup default mock returns
        const mockConfig = {
            get: jest.fn().mockReturnValue(false),
            update: jest.fn()
        };
        (mockWorkspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);
        
        (mockUri.file as jest.Mock).mockImplementation((path: string) => ({ fsPath: path }));
        (mockUri.parse as jest.Mock).mockImplementation((uri: string) => uri);
    });

    describe('pollForVsix', () => {
        it('should successfully find a VSIX file', async () => {
            const expectedPath = 'C:\\Users\\test\\Downloads\\test.extension-1.0.0.vsix';
            (mockUtils.pollDownloadedFile as jest.Mock).mockResolvedValue(expectedPath);

            const result = await ExtensionInstaller.pollForVsix(mockExtension);

            expect(mockUtils.pollDownloadedFile).toHaveBeenCalledWith(
                'test.extension-1.0.0.vsix',
                30000,
                1000
            );
            expect(result).toBe(expectedPath);
        });

        it('should use custom timeout and poll interval', async () => {
            const expectedPath = 'C:\\Users\\test\\Downloads\\test.extension-1.0.0.vsix';
            (mockUtils.pollDownloadedFile as jest.Mock).mockResolvedValue(expectedPath);

            const result = await ExtensionInstaller.pollForVsix(mockExtension, 60000, 2000);

            expect(mockUtils.pollDownloadedFile).toHaveBeenCalledWith(
                'test.extension-1.0.0.vsix',
                60000,
                2000
            );
            expect(result).toBe(expectedPath);
        });

        it('should return undefined when file is not found', async () => {
            (mockUtils.pollDownloadedFile as jest.Mock).mockResolvedValue(undefined);

            const result = await ExtensionInstaller.pollForVsix(mockExtension);

            expect(result).toBeUndefined();
        });

        it('should show error and return undefined when extension is null', async () => {
            const result = await ExtensionInstaller.pollForVsix(null as any);

            expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
                'Extension packageName is missing or invalid. Cannot search for VSIX file.'
            );
            expect(result).toBeUndefined();
        });

        it('should show error and return undefined when extension has no packageName', async () => {
            const invalidExtension = { ...mockExtension, packageName: '' };

            const result = await ExtensionInstaller.pollForVsix(invalidExtension);

            expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
                'Extension packageName is missing or invalid. Cannot search for VSIX file.'
            );
            expect(result).toBeUndefined();
        });

        it('should show error and return undefined when extension packageName is undefined', async () => {
            const invalidExtension = { ...mockExtension };
            delete (invalidExtension as any).packageName;

            const result = await ExtensionInstaller.pollForVsix(invalidExtension);

            expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
                'Extension packageName is missing or invalid. Cannot search for VSIX file.'
            );
            expect(result).toBeUndefined();
        });

        it('should find Windows duplicate VSIX file with (1) suffix', async () => {
            const duplicatePath = 'C:\\Users\\test\\Downloads\\test.extension-1.0.0 (1).vsix';
            (mockUtils.pollDownloadedFile as jest.Mock).mockResolvedValue(duplicatePath);

            const result = await ExtensionInstaller.pollForVsix(mockExtension);

            expect(result).toBe(duplicatePath);
            expect(mockUtils.pollDownloadedFile).toHaveBeenCalledWith(
                'test.extension-1.0.0.vsix',
                30000,
                1000
            );
        });

        it('should find the newest VSIX file when multiple duplicates exist', async () => {
            const newestPath = 'C:\\Users\\test\\Downloads\\test.extension-1.0.0 (3).vsix';
            (mockUtils.pollDownloadedFile as jest.Mock).mockResolvedValue(newestPath);

            const result = await ExtensionInstaller.pollForVsix(mockExtension);

            expect(result).toBe(newestPath);
        });
    });

    describe('installVsixFromFile', () => {
        const vsixPath = 'C:\\Users\\test\\Downloads\\test.extension-1.0.0.vsix';
        const extensionName = 'Test Extension';

        it('should successfully install VSIX file and prompt user', async () => {
            (mockCommands.executeCommand as jest.Mock).mockResolvedValue(undefined);
            (mockWindow.showInformationMessage as jest.Mock).mockResolvedValue('OK');

            await ExtensionInstaller.installVsixFromFile(vsixPath, extensionName);

            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                'Installing Test Extension, this may take a minute...'
            );
            expect(mockCommands.executeCommand).toHaveBeenCalledWith(
                'workbench.extensions.installExtension',
                { fsPath: vsixPath }
            );
            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                `Installed extension from ${vsixPath}. Would you like to open the extension in the extensions view?`,
                'OK',
                'Dismiss',
                "Don't show again"
            );
            expect(mockCommands.executeCommand).toHaveBeenCalledWith(
                'workbench.extensions.search',
                extensionName
            );
        });

        it('should handle installation failure', async () => {
            const error = new Error('Installation failed');
            (mockCommands.executeCommand as jest.Mock).mockRejectedValue(error);

            await ExtensionInstaller.installVsixFromFile(vsixPath, extensionName);

            expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
                'Failed to install Test Extension: Installation failed'
            );
        });

        it('should handle installation failure with non-Error object', async () => {
            (mockCommands.executeCommand as jest.Mock).mockRejectedValue('String error');

            await ExtensionInstaller.installVsixFromFile(vsixPath, extensionName);

            expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
                'Failed to install Test Extension: String error'
            );
        });

        it('should show simple message when hide setting is enabled', async () => {
            (mockCommands.executeCommand as jest.Mock).mockResolvedValue(undefined);
            const mockConfig = {
                get: jest.fn().mockReturnValue(true),
                update: jest.fn()
            };
            (mockWorkspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

            await ExtensionInstaller.installVsixFromFile(vsixPath, extensionName);

            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                'Installing Test Extension, this may take a minute...'
            );
            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                `Installed Test Extension from ${vsixPath}.`
            );
            // Should not show the prompt dialog
            expect(mockWindow.showInformationMessage).not.toHaveBeenCalledWith(
                expect.stringContaining('Would you like to open'),
                expect.anything(),
                expect.anything(),
                expect.anything()
            );
        });

        it('should handle "Dismiss" action', async () => {
            (mockCommands.executeCommand as jest.Mock).mockResolvedValue(undefined);
            (mockWindow.showInformationMessage as jest.Mock).mockResolvedValue('Dismiss');

            await ExtensionInstaller.installVsixFromFile(vsixPath, extensionName);

            expect(mockCommands.executeCommand).not.toHaveBeenCalledWith(
                'workbench.extensions.search',
                extensionName
            );
            expect(mockWorkspace.getConfiguration().update).not.toHaveBeenCalled();
        });

        it('should handle "Don\'t show again" action', async () => {
            (mockCommands.executeCommand as jest.Mock).mockResolvedValue(undefined);
            (mockWindow.showInformationMessage as jest.Mock).mockResolvedValue("Don't show again");
            const mockConfig = {
                get: jest.fn().mockReturnValue(false),
                update: jest.fn()
            };
            (mockWorkspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

            await ExtensionInstaller.installVsixFromFile(vsixPath, extensionName);

            expect(mockConfig.update).toHaveBeenCalledWith(
                'vscode-private-marketplace.hideVsixInstallMessage',
                true,
                vscode.ConfigurationTarget.Global
            );
        });

        it('should handle undefined action (dialog closed)', async () => {
            (mockCommands.executeCommand as jest.Mock).mockResolvedValue(undefined);
            (mockWindow.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

            await ExtensionInstaller.installVsixFromFile(vsixPath, extensionName);

            expect(mockCommands.executeCommand).not.toHaveBeenCalledWith(
                'workbench.extensions.search',
                extensionName
            );
            expect(mockWorkspace.getConfiguration().update).not.toHaveBeenCalled();
        });
    });

    describe('downloadAndInstall', () => {
        it('should install existing VSIX file without downloading', async () => {
            const existingVsixPath = 'C:\\Users\\test\\Downloads\\test.extension-1.0.0.vsix';
            (mockUtils.pollDownloadedFile as jest.Mock)
                .mockResolvedValueOnce(existingVsixPath) // First call finds existing file
                .mockResolvedValueOnce(undefined); // Second call shouldn't happen
            
            (mockCommands.executeCommand as jest.Mock).mockResolvedValue(undefined);
            (mockWindow.showInformationMessage as jest.Mock).mockResolvedValue('Dismiss');

            await ExtensionInstaller.downloadAndInstall(mockExtension);

            expect(mockUtils.pollDownloadedFile).toHaveBeenCalledWith(
                'test.extension-1.0.0.vsix',
                1000,
                1000
            );
            expect(mockEnv.openExternal).not.toHaveBeenCalled();
            expect(mockCommands.executeCommand).toHaveBeenCalledWith(
                'workbench.extensions.installExtension',
                { fsPath: existingVsixPath }
            );
        });

        it('should download and install VSIX file when not existing', async () => {
            const downloadedVsixPath = 'C:\\Users\\test\\Downloads\\test.extension-1.0.0.vsix';
            
            // Mock the pollDownloadedFile method to return different values based on timeout
            (mockUtils.pollDownloadedFile as jest.Mock).mockImplementation((filename: string, timeout: number) => {
                if (timeout === 1000) {
                    // First call with short timeout - no existing file
                    return Promise.resolve(undefined);
                } else {
                    // Second call with longer timeout - file found
                    return Promise.resolve(downloadedVsixPath);
                }
            });
            
            (mockCommands.executeCommand as jest.Mock).mockResolvedValue(undefined);
            (mockWindow.showInformationMessage as jest.Mock).mockResolvedValue('Dismiss');

            await ExtensionInstaller.downloadAndInstall(mockExtension);

            expect(mockUtils.pollDownloadedFile).toHaveBeenCalledTimes(2);
            expect(mockEnv.openExternal).toHaveBeenCalledWith(mockExtension.downloadURL);
            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                'Installing Test Extension, this may take a minute...'
            );
            expect(mockCommands.executeCommand).toHaveBeenCalledWith(
                'workbench.extensions.installExtension',
                { fsPath: downloadedVsixPath }
            );
        });

        it('should handle download timeout gracefully', async () => {
            // Mock to always return undefined (no file found)
            (mockUtils.pollDownloadedFile as jest.Mock).mockResolvedValue(undefined);

            await ExtensionInstaller.downloadAndInstall(mockExtension);

            expect(mockEnv.openExternal).toHaveBeenCalledWith(mockExtension.downloadURL);
            expect(mockUtils.pollDownloadedFile).toHaveBeenCalledTimes(2);
        });

        it('should handle invalid extension gracefully', async () => {
            (mockUtils.pollDownloadedFile as jest.Mock).mockResolvedValue(undefined);

            await ExtensionInstaller.downloadAndInstall(null as any);

            expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
                'Extension packageName is missing or invalid. Cannot search for VSIX file.'
            );
            expect(mockEnv.openExternal).not.toHaveBeenCalled();
        });
    });
});