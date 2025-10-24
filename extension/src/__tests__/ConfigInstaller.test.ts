import * as vscode from 'vscode';
import * as path from 'path';
import { ConfigInstaller } from '../Installer';
import { Utils } from '../utils';

jest.mock('vscode');
jest.mock('fs');
jest.mock('path');
jest.mock('../utils');

// Mock modules with proper types
const mockPath = path as jest.Mocked<typeof path>;
const mockUtils = Utils as jest.Mocked<typeof Utils>;

// Access the mocked vscode functions
const mockWindow = vscode.window as jest.Mocked<typeof vscode.window>;
const mockEnv = vscode.env as jest.Mocked<typeof vscode.env>;
const mockUri = vscode.Uri as jest.Mocked<typeof vscode.Uri>;

describe('ConfigInstaller', () => {
    const mockFilePath = 'C:\\Users\\test\\Downloads\\zowe.config.json';
    const mockTargetFilename = 'zowe.config.json';
    const mockZoweFolder = 'C:\\Users\\test\\.zowe';
    const mockTargetPath = 'C:\\Users\\test\\.zowe\\zowe.config.json';

    beforeEach(() => {
        jest.clearAllMocks();
        
        (mockUtils.getZoweFolder as jest.Mock).mockReturnValue(mockZoweFolder);
        (mockPath.join as jest.Mock).mockReturnValue(mockTargetPath);
        (mockUri.parse as jest.Mock).mockImplementation((uri: string) => uri);
        
        // Mock the new pollAndValidateConfigFile method
        (mockUtils.pollAndValidateConfigFile as jest.Mock) = jest.fn();
    });

    describe('moveConfigFileToZoweFolder', () => {
        it('should successfully move config file to Zowe folder', () => {
            jest.spyOn(Utils, 'moveFile').mockImplementation(() => {});

            ConfigInstaller.moveConfigFileToZoweFolder(mockFilePath, mockTargetFilename);

            expect(Utils.moveFile).toHaveBeenCalledWith(mockFilePath, mockTargetPath);
            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                `Successfully moved ${mockTargetFilename} to ${mockZoweFolder}.`
            );
        });

        it('should handle move file error', () => {
            const error = new Error('Permission denied');
            jest.spyOn(Utils, 'moveFile').mockImplementation(() => {
                throw error;
            });

            ConfigInstaller.moveConfigFileToZoweFolder(mockFilePath, mockTargetFilename);

            expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
                `Failed to move ${mockTargetFilename} to ${mockZoweFolder}: Permission denied`
            );
        });

        it('should handle non-Error exceptions', () => {
            jest.spyOn(Utils, 'moveFile').mockImplementation(() => {
                throw 'String error';
            });

            ConfigInstaller.moveConfigFileToZoweFolder(mockFilePath, mockTargetFilename);

            expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
                `Failed to move ${mockTargetFilename} to ${mockZoweFolder}: String error`
            );
        });
    });

    describe('downloadAndInstallConfig', () => {
        const mockUrl = 'https://dev.azure.com/vscode-Technology/22844d09-29df-4b0c-bff7-39ad061d525a/_apis/git/repositories/18f48cff-f1fe-4f8e-a761-95d74340cb8d/items?path=/zowe.config.json&versionDescriptor%5BversionOptions%5D=0&versionDescriptor%5BversionType%5D=0&versionDescriptor%5Bversion%5D=main&resolveLfs=true&%24format=octetStream&api-version=5.0&download=true';
        const expectedVersion = 5;

        it('should successfully download and install config file when no existing file found', async () => {
            // First call returns undefined (no existing file), second call returns the downloaded file
            (mockUtils.pollAndValidateConfigFile as jest.Mock)
                .mockResolvedValueOnce(undefined)  // First check for existing file
                .mockResolvedValueOnce(mockFilePath);  // After download
            jest.spyOn(Utils, 'moveFile').mockImplementation(() => {});

            await ConfigInstaller.downloadAndInstallConfig(mockTargetFilename, mockUrl, expectedVersion);

            expect(mockUtils.pollAndValidateConfigFile).toHaveBeenCalledTimes(2);
            expect(mockUtils.pollAndValidateConfigFile).toHaveBeenNthCalledWith(1, mockTargetFilename, expectedVersion, 1000, 1000);
            expect(mockUtils.pollAndValidateConfigFile).toHaveBeenNthCalledWith(2, mockTargetFilename, expectedVersion);
            expect(mockEnv.openExternal).toHaveBeenCalledWith(mockUrl);
            expect(mockUtils.getZoweFolder).toHaveBeenCalled();
            expect(mockPath.join).toHaveBeenCalledWith(mockZoweFolder, mockTargetFilename);
            expect(Utils.moveFile).toHaveBeenCalledWith(mockFilePath, mockTargetPath);
            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                `Successfully moved ${mockTargetFilename} to ${mockZoweFolder}.`
            );
        });

        it('should use existing valid file without prompting download', async () => {
            // First call finds existing valid file
            (mockUtils.pollAndValidateConfigFile as jest.Mock).mockResolvedValueOnce(mockFilePath);
            jest.spyOn(Utils, 'moveFile').mockImplementation(() => {});

            await ConfigInstaller.downloadAndInstallConfig(mockTargetFilename, mockUrl, expectedVersion);

            expect(mockUtils.pollAndValidateConfigFile).toHaveBeenCalledTimes(1);
            expect(mockUtils.pollAndValidateConfigFile).toHaveBeenCalledWith(mockTargetFilename, expectedVersion, 1000, 1000);
            expect(mockEnv.openExternal).not.toHaveBeenCalled();  // Should not prompt download
            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                `Found existing valid ${mockTargetFilename} in Downloads folder to use.`
            );
            expect(Utils.moveFile).toHaveBeenCalledWith(mockFilePath, mockTargetPath);
            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                `Successfully moved ${mockTargetFilename} to ${mockZoweFolder}.`
            );
        });

        it('should show warning when file with correct version is not found within timeout', async () => {
            // Both calls return undefined (no existing file, and no file found after download)
            (mockUtils.pollAndValidateConfigFile as jest.Mock)
                .mockResolvedValueOnce(undefined)  // First check for existing file
                .mockResolvedValueOnce(undefined); // After download attempt

            await ConfigInstaller.downloadAndInstallConfig(mockTargetFilename, mockUrl, expectedVersion);

            expect(mockUtils.pollAndValidateConfigFile).toHaveBeenCalledTimes(2);
            expect(mockEnv.openExternal).toHaveBeenCalledWith(mockUrl);
            expect(mockWindow.showWarningMessage).toHaveBeenCalledWith(
                `${mockTargetFilename} with the correct version (${expectedVersion}) was not found in your Downloads folder after 30 seconds. ` +
                `Please ensure you download the latest version or remove any old versions from your Downloads folder and try again.`
            );
            expect(Utils.moveFile).not.toHaveBeenCalled();
        });

        it('should handle move error after successful download and validation', async () => {
            // First call returns undefined (no existing file), second call returns the downloaded file
            (mockUtils.pollAndValidateConfigFile as jest.Mock)
                .mockResolvedValueOnce(undefined)  // First check for existing file
                .mockResolvedValueOnce(mockFilePath); // After download
            const error = new Error('Move failed');
            jest.spyOn(Utils, 'moveFile').mockImplementation(() => {
                throw error;
            });

            await ConfigInstaller.downloadAndInstallConfig(mockTargetFilename, mockUrl, expectedVersion);

            expect(mockEnv.openExternal).toHaveBeenCalledWith(mockUrl);
            expect(mockUtils.pollAndValidateConfigFile).toHaveBeenCalledTimes(2);
            expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
                `Failed to move ${mockTargetFilename} to ${mockZoweFolder}: Move failed`
            );
        });

        it('should handle different config file types with version validation', async () => {
            const schemaFilename = 'zowe.schema.json';
            const schemaPath = 'C:\\Users\\test\\Downloads\\zowe.schema.json';
            const schemaTargetPath = 'C:\\Users\\test\\.zowe\\zowe.schema.json';
            const schemaVersion = 3;
            
            // First call returns undefined (no existing file), second call returns the downloaded file
            (mockUtils.pollAndValidateConfigFile as jest.Mock)
                .mockResolvedValueOnce(undefined)  // First check for existing file
                .mockResolvedValueOnce(schemaPath); // After download
            (mockPath.join as jest.Mock).mockReturnValue(schemaTargetPath);
            jest.spyOn(Utils, 'moveFile').mockImplementation(() => {});

            await ConfigInstaller.downloadAndInstallConfig(schemaFilename, mockUrl, schemaVersion);

            expect(mockEnv.openExternal).toHaveBeenCalledWith(mockUrl);
            expect(mockUtils.pollAndValidateConfigFile).toHaveBeenCalledTimes(2);
            expect(mockUtils.pollAndValidateConfigFile).toHaveBeenNthCalledWith(1, schemaFilename, schemaVersion, 1000, 1000);
            expect(mockUtils.pollAndValidateConfigFile).toHaveBeenNthCalledWith(2, schemaFilename, schemaVersion);
            expect(mockUtils.getZoweFolder).toHaveBeenCalled();
            expect(mockPath.join).toHaveBeenCalledWith(mockZoweFolder, schemaFilename);
            expect(Utils.moveFile).toHaveBeenCalledWith(schemaPath, schemaTargetPath);
        });

        it('should validate version and move the newest correct file when multiple duplicates exist', async () => {
            const filename = 'zowe.config.json';
            const url = 'https://test-url.com';
            const newestValidFile = 'C:\\Users\\test\\Downloads\\zowe.config (2).json';
            
            // First call returns undefined (no existing file), second call returns the downloaded file
            (mockUtils.pollAndValidateConfigFile as jest.Mock)
                .mockResolvedValueOnce(undefined)  // First check for existing file
                .mockResolvedValueOnce(newestValidFile); // After download
            jest.spyOn(Utils, 'moveFile').mockImplementation(() => {});

            await ConfigInstaller.downloadAndInstallConfig(filename, url, expectedVersion);

            expect(mockEnv.openExternal).toHaveBeenCalledWith(url);
            expect(mockUtils.pollAndValidateConfigFile).toHaveBeenCalledTimes(2);
            expect(Utils.moveFile).toHaveBeenCalledWith(newestValidFile, mockTargetPath);
            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                `Successfully moved ${filename} to ${mockZoweFolder}.`
            );
        });

        it('should handle config files with Windows duplicate naming and version validation', async () => {
            const filename = 'zowe.schema.json';
            const url = 'https://test-url.com';
            const duplicateFile = 'C:\\Users\\test\\Downloads\\zowe.schema (1).json';
            const targetPath = 'C:\\Users\\test\\.zowe\\zowe.schema.json';
            const schemaVersion = 2;
            
            // First call returns undefined (no existing file), second call returns the downloaded file
            (mockUtils.pollAndValidateConfigFile as jest.Mock)
                .mockResolvedValueOnce(undefined)  // First check for existing file
                .mockResolvedValueOnce(duplicateFile); // After download
            (mockPath.join as jest.Mock).mockReturnValue(targetPath);
            jest.spyOn(Utils, 'moveFile').mockImplementation(() => {});

            await ConfigInstaller.downloadAndInstallConfig(filename, url, schemaVersion);

            expect(mockEnv.openExternal).toHaveBeenCalledWith(url);
            expect(mockUtils.pollAndValidateConfigFile).toHaveBeenCalledTimes(2);
            expect(Utils.moveFile).toHaveBeenCalledWith(duplicateFile, targetPath);
            expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
                `Successfully moved ${filename} to ${mockZoweFolder}.`
            );
        });
    });
});
