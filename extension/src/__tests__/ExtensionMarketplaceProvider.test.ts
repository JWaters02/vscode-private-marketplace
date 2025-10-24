import { ExtensionMarketplaceProvider } from '../Marketplace';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { Constants } from '../Constants';
import { Utils } from '../utils';
import { ExtensionJson } from '../Types';

jest.mock('vscode');
jest.mock('fs');
jest.mock('../utils');

// Mock modules
const mockVscode = vscode as jest.Mocked<typeof vscode>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockUtils = Utils as jest.Mocked<typeof Utils>;

describe('ExtensionMarketplaceProvider', () => {
    let provider: ExtensionMarketplaceProvider;
    let mockContext: vscode.ExtensionContext;
    let mockGlobalState: any;

    const mockExtensionJson: ExtensionJson = {
        approvedExtensionsPath: '/approved',
        approvedExtensions: [
            {
                name: 'Test Extension 1',
                packageName: 'test.extension1-1.0.0',
                category: 'Testing'
            },
            {
                name: 'Test Extension 2',
                packageName: 'test.extension2-2.0.0',
                category: 'Development'
            },
            {
                name: 'Test Extension 3',
                packageName: 'test.extension3-1.5.0'
                // No category - should default to "Other"
            }
        ],
        extraWhitelist: ['extra.extension'],
        allowAllVersions: ['any.version.extension'],
        zoweConfigVersion: 5,
        zoweSchemaVersion: 3
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock global state
        mockGlobalState = {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(),
            setKeysForSync: jest.fn()
        };

        // Setup mock extension context
        mockContext = {
            globalState: mockGlobalState,
            workspaceState: {} as vscode.Memento,
            extensionUri: mockVscode.Uri.file('C:\\test'),
            extensionPath: 'C:\\test',
            subscriptions: [],
            asAbsolutePath: jest.fn(),
            storagePath: 'C:\\storage',
            globalStoragePath: 'C:\\global-storage',
            logPath: 'C:\\logs',
            secrets: {} as vscode.SecretStorage,
            extensionMode: 1,
            logUri: mockVscode.Uri.file('C:\\logs'),
            environmentVariableCollection: {} as any,
            storageUri: mockVscode.Uri.file('C:\\storage'),
            globalStorageUri: mockVscode.Uri.file('C:\\global-storage'),
            extension: {} as any,
            languageModelAccessInformation: {} as any
        } as vscode.ExtensionContext;

        // Setup default mock returns
        mockGlobalState.get.mockImplementation((key: string) => {
            switch (key) {
                case Constants.TEST_MODE_KEY:
                    return false;
                case Constants.KNOWN_EXTENSIONS_KEY:
                    return {};
                case Constants.CONFIG_VERSIONS_KEY:
                    return { zoweConfig: 0, zoweSchema: 0 };
                default:
                    return undefined;
            }
        });

        // Setup default Utils mocks with Windows paths and real URLs
        mockUtils.getZoweFolder.mockReturnValue('C:\\Users\\test\\.zowe');
        mockUtils.getVsixDownloadUrl.mockReturnValue('https://dev.azure.com/vscode-Technology/22844d09-29df-4b0c-bff7-39ad061d525a/_apis/git/repositories/18f48cff-f1fe-4f8e-a761-95d74340cb8d/items?path=/approved/test.extension1-1.0.0.vsix&versionDescriptor%5BversionOptions%5D=0&versionDescriptor%5BversionType%5D=0&versionDescriptor%5Bversion%5D=main&resolveLfs=true&%24format=octetStream&api-version=5.0&download=true');
        mockUtils.getConfigDownloadUrl.mockReturnValue('https://dev.azure.com/vscode-Technology/22844d09-29df-4b0c-bff7-39ad061d525a/_apis/git/repositories/18f48cff-f1fe-4f8e-a761-95d74340cb8d/items?path=/zowe.config.json&versionDescriptor%5BversionOptions%5D=0&versionDescriptor%5BversionType%5D=0&versionDescriptor%5Bversion%5D=main&resolveLfs=true&%24format=octetStream&api-version=5.0&download=true');
        mockUtils.getExtensionJsonDownloadUrl.mockReturnValue('https://dev.azure.com/vscode-Technology/22844d09-29df-4b0c-bff7-39ad061d525a/_apis/git/repositories/18f48cff-f1fe-4f8e-a761-95d74340cb8d/items?path=/extensions.json&versionDescriptor%5BversionOptions%5D=0&versionDescriptor%5BversionType%5D=0&versionDescriptor%5Bversion%5D=main&resolveLfs=true&%24format=octetStream&api-version=5.0&download=true');
        mockUtils.deleteFileIfExists.mockImplementation(() => {});
        mockUtils.pollDownloadedFile.mockResolvedValue('C:\\Users\\test\\Downloads\\extensions.json');

        provider = new ExtensionMarketplaceProvider(mockContext);
    });

    describe('constructor', () => {
        it('should initialize with default values', () => {
            expect(provider.branch).toBe(Constants.AZURE_BRANCH_MAIN);
            expect(provider.extensionJson).toBeNull();
        });

        it('should set test branch when test mode is enabled', () => {
            mockGlobalState.get.mockImplementation((key: string) => {
                if (key === Constants.TEST_MODE_KEY) return true;
                return {};
            });

            const testProvider = new ExtensionMarketplaceProvider(mockContext);
            expect(testProvider.branch).toBe(Constants.AZURE_BRANCH_TEST);
        });

        it('should load previous extensions from global state', () => {
            const previousExtensions = { 'test.extension': '1.0.0' };
            mockGlobalState.get.mockImplementation((key: string) => {
                if (key === Constants.KNOWN_EXTENSIONS_KEY) return previousExtensions;
                return {};
            });

            const testProvider = new ExtensionMarketplaceProvider(mockContext);
            expect(mockGlobalState.get).toHaveBeenCalledWith(Constants.KNOWN_EXTENSIONS_KEY);
        });
    });

    describe('getTreeItem', () => {
        it('should return the same tree item', () => {
            const treeItem = new vscode.TreeItem('Test', vscode.TreeItemCollapsibleState.None);
            const result = provider.getTreeItem(treeItem as any);
            expect(result).toBe(treeItem);
        });
    });

    describe('getChildren', () => {
        it('should return fetch button when extensionJson is not loaded', async () => {
            const children = await provider.getChildren();
            
            expect(children).toHaveLength(1);
            expect(children[0].label).toBe('Fetch Extension List');
            expect(children[0].contextValue).toBe('fetchExtensionJson');
            expect(children[0].command?.command).toBe('vscode-private-marketplace.fetchExtensionJson');
        });

        it('should return top-level categories when extensionJson is loaded', async () => {
            provider.setExtensionJson(mockExtensionJson);
            
            const children = await provider.getChildren();
            
            expect(children.length).toBeGreaterThan(0);
            expect(children.some(child => child.label === 'Approved Extensions')).toBe(true);
        });

        it('should return "No Approved Extensions" when no extensions exist', async () => {
            const emptyExtensionJson: ExtensionJson = {
                approvedExtensionsPath: '/approved',
                approvedExtensions: []
            };
            provider.setExtensionJson(emptyExtensionJson);
            
            const children = await provider.getChildren();
            
            expect(children.some(child => child.label === 'No Approved Extensions')).toBe(true);
        });

        it('should include updated extensions when they exist', async () => {
            // Setup previous extensions to trigger updates
            mockGlobalState.get.mockImplementation((key: string) => {
                if (key === Constants.KNOWN_EXTENSIONS_KEY) {
                    return { 'test.extension1-1.0.0': '0.9.0' };
                }
                return {};
            });

            const testProvider = new ExtensionMarketplaceProvider(mockContext);
            testProvider.setExtensionJson(mockExtensionJson);
            
            const children = await testProvider.getChildren();
            
            expect(children.some(child => child.label === 'Updated Extensions')).toBe(true);
        });

        it('should handle category-approved element', async () => {
            provider.setExtensionJson(mockExtensionJson);
            
            const categoryElement = {
                contextValue: 'category-approved'
            } as any;
            
            const children = await provider.getChildren(categoryElement);
            
            expect(children.length).toBeGreaterThan(0);
            expect(children.some(child => child.label === 'Testing')).toBe(true);
            expect(children.some(child => child.label === 'Development')).toBe(true);
            expect(children.some(child => child.label === 'Other')).toBe(true);
        });

        it('should handle category-updated element', async () => {
            // Setup to have updated extensions
            mockGlobalState.get.mockImplementation((key: string) => {
                if (key === Constants.KNOWN_EXTENSIONS_KEY) {
                    return { 'test.extension1-1.0.0': '0.9.0' };
                }
                return {};
            });

            const testProvider = new ExtensionMarketplaceProvider(mockContext);
            testProvider.setExtensionJson(mockExtensionJson);
            
            const categoryElement = {
                contextValue: 'category-updated'
            } as any;
            
            const children = await testProvider.getChildren(categoryElement);
            
            expect(children.length).toBeGreaterThan(0);
        });

        it('should handle extension-category element for approved extensions', async () => {
            provider.setExtensionJson(mockExtensionJson);
            mockUtils.getVsixDownloadUrl.mockReturnValue('https://dev.azure.com/vscode-Technology/22844d09-29df-4b0c-bff7-39ad061d525a/_apis/git/repositories/18f48cff-f1fe-4f8e-a761-95d74340cb8d/items?path=/approved/test.extension1-1.0.0.vsix&versionDescriptor%5BversionOptions%5D=0&versionDescriptor%5BversionType%5D=0&versionDescriptor%5Bversion%5D=main&resolveLfs=true&%24format=octetStream&api-version=5.0&download=true');
            
            const categoryElement = {
                contextValue: 'extension-category',
                extensionData: {
                    parentType: Constants.APPROVED_EXTENSIONS,
                    category: 'Testing'
                }
            } as any;
            
            const children = await provider.getChildren(categoryElement);
            
            expect(children).toHaveLength(1);
            expect(children[0].label).toBe('Test Extension 1');
            expect(children[0].contextValue).toBe('extension-downloadable');
        });

        it('should include config download buttons when versions are outdated', async () => {
            // Mock file system to return lower versions
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ "vscode-internal-version": 1 }));

            const jsonWithVersions: ExtensionJson = {
                ...mockExtensionJson,
                zoweConfigVersion: 5,
                zoweSchemaVersion: 3
            };

            provider.setExtensionJson(jsonWithVersions);
            // Manually call updateConfigVersions since setExtensionJson doesn't call it
            provider['updateConfigVersions'](jsonWithVersions);
            
            const children = await provider.getChildren();
            
            expect(children.some(child => child.label === 'Download Updated Config JSON')).toBe(true);
            expect(children.some(child => child.label === 'Download Updated Schema JSON')).toBe(true);
        });

        it('should not include config download buttons when extension JSON has no config versions', async () => {
            // Mock file system to return lower versions
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ "vscode-internal-version": 1 }));

            const jsonWithoutVersions: ExtensionJson = {
                ...mockExtensionJson
                // No zoweConfigVersion or zoweSchemaVersion fields
            };
            delete (jsonWithoutVersions as any).zoweConfigVersion;
            delete (jsonWithoutVersions as any).zoweSchemaVersion;

            provider.setExtensionJson(jsonWithoutVersions);
            provider['updateConfigVersions'](jsonWithoutVersions);
            
            const children = await provider.getChildren();
            
            // Should not show config buttons when extension JSON has no version info
            expect(children.some(child => child.label === 'Download Updated Config JSON')).toBe(false);
            expect(children.some(child => child.label === 'Download Updated Schema JSON')).toBe(false);
        });
    });

    describe('setExtensionJson', () => {
        it('should set extension json and fire tree data change event', () => {
            const firespy = jest.spyOn(provider['_onDidChangeTreeData'], 'fire');
            
            provider.setExtensionJson(mockExtensionJson);
            
            expect(provider.extensionJson).toBe(mockExtensionJson);
            expect(firespy).toHaveBeenCalled();
        });
    });

    describe('fetchAndLoadExtensionJson', () => {
        beforeEach(() => {
            mockFs.readFileSync.mockReturnValue(JSON.stringify(mockExtensionJson));
        });

        it('should fetch and load extension json successfully', async () => {
            await provider.fetchAndLoadExtensionJson();
            
            expect(mockUtils.deleteFileIfExists).toHaveBeenCalledWith(Constants.EXTENSION_JSON_FILENAME);
            expect(mockVscode.env.openExternal).toHaveBeenCalled();
            expect(mockUtils.pollDownloadedFile).toHaveBeenCalledWith(Constants.EXTENSION_JSON_FILENAME);
            expect(provider.extensionJson).toEqual(mockExtensionJson);
        });

        it('should show warning when file is not found', async () => {
            mockUtils.pollDownloadedFile.mockResolvedValue(undefined);
            
            await provider.fetchAndLoadExtensionJson();
            
            expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('was not found in your Downloads folder')
            );
        });

        it('should show error when JSON parsing fails', async () => {
            mockFs.readFileSync.mockReturnValue('invalid json');
            
            await provider.fetchAndLoadExtensionJson();
            
            expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Failed to parse')
            );
        });

        it('should update config versions after loading json', async () => {
            await provider.fetchAndLoadExtensionJson();
            
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                Constants.CONFIG_VERSIONS_KEY,
                { zoweConfig: 5, zoweSchema: 3 }
            );
        });
    });

    describe('toggleTestMode', () => {
        it('should toggle from main to test branch', () => {
            expect(provider.branch).toBe(Constants.AZURE_BRANCH_MAIN);
            
            provider.toggleTestMode();
            
            expect(provider.branch).toBe(Constants.AZURE_BRANCH_TEST);
            expect(provider.extensionJson).toBeNull();
        });

        it('should toggle from test to main branch', () => {
            provider.branch = Constants.AZURE_BRANCH_TEST;
            
            provider.toggleTestMode();
            
            expect(provider.branch).toBe(Constants.AZURE_BRANCH_MAIN);
            expect(provider.extensionJson).toBeNull();
        });

        it('should fire tree data change event', () => {
            const firespy = jest.spyOn(provider['_onDidChangeTreeData'], 'fire');
            
            provider.toggleTestMode();
            
            expect(firespy).toHaveBeenCalled();
        });
    });

    describe('getUpdatedExtensions', () => {
        it('should identify updated extensions', () => {
            // Setup previous extensions
            mockGlobalState.get.mockImplementation((key: string) => {
                if (key === Constants.KNOWN_EXTENSIONS_KEY) {
                    return { 
                        'test.extension1-1.0.0': '0.9.0',
                        'test.extension2-2.0.0': '2.0.0' // Same version
                    };
                }
                return {};
            });

            const testProvider = new ExtensionMarketplaceProvider(mockContext);
            testProvider.setExtensionJson(mockExtensionJson);
            
            const updatedExtensions = testProvider['getUpdatedExtensions']();
            
            expect(updatedExtensions).toHaveLength(1);
            expect(updatedExtensions[0].ext.name).toBe('Test Extension 1');
            expect(updatedExtensions[0].prevVersion).toBe('0.9.0');
            expect(updatedExtensions[0].newVersion).toBe('1.0.0');
        });

        it('should handle extensions with no previous version', () => {
            mockGlobalState.get.mockImplementation((key: string) => {
                if (key === Constants.KNOWN_EXTENSIONS_KEY) return {};
                return {};
            });

            const testProvider = new ExtensionMarketplaceProvider(mockContext);
            testProvider.setExtensionJson(mockExtensionJson);
            
            const updatedExtensions = testProvider['getUpdatedExtensions']();
            
            expect(updatedExtensions).toHaveLength(0);
        });
    });

    describe('shouldShowConfigFetchButtons', () => {
        it('should show buttons when local versions are older', () => {
            mockUtils.getZoweFolder.mockReturnValue('C:\\Users\\test\\.zowe');
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ "vscode-internal-version": 1 }));
            
            provider.setExtensionJson(mockExtensionJson);
            // Manually call updateConfigVersions since setExtensionJson doesn't call it
            provider['updateConfigVersions'](mockExtensionJson);
            
            const result = provider['shouldShowConfigFetchButtons']();
            
            expect(result.zoweConfig).toBe(true);
            expect(result.zoweSchema).toBe(true);
        });

        it('should not show buttons when local versions are current', () => {
            mockUtils.getZoweFolder.mockReturnValue('C:\\Users\\test\\.zowe');
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ "vscode-internal-version": 5 }));
            
            provider.setExtensionJson(mockExtensionJson);
            // Manually call updateConfigVersions to set the currentVersions properly
            provider['updateConfigVersions'](mockExtensionJson);
            
            const result = provider['shouldShowConfigFetchButtons']();
            
            expect(result.zoweConfig).toBe(false);
            expect(result.zoweSchema).toBe(false);
        });

        it('should handle missing files', () => {
            mockUtils.getZoweFolder.mockReturnValue('C:\\Users\\test\\.zowe');
            mockFs.existsSync.mockReturnValue(false);
            
            provider.setExtensionJson(mockExtensionJson);
            // Manually call updateConfigVersions since setExtensionJson doesn't call it
            provider['updateConfigVersions'](mockExtensionJson);
            
            const result = provider['shouldShowConfigFetchButtons']();
            
            expect(result.zoweConfig).toBe(true);
            expect(result.zoweSchema).toBe(true);
        });

        it('should handle config files with no version field', () => {
            mockUtils.getZoweFolder.mockReturnValue('C:\\Users\\test\\.zowe');
            mockFs.existsSync.mockReturnValue(true);
            // Config file exists but has no vscode-internal-version field
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ "other": "data" }));
            
            provider.setExtensionJson(mockExtensionJson);
            provider['updateConfigVersions'](mockExtensionJson);
            
            const result = provider['shouldShowConfigFetchButtons']();
            
            // Should show buttons since local version is 0 (default when no version field)
            expect(result.zoweConfig).toBe(true);
            expect(result.zoweSchema).toBe(true);
        });

        it('should handle invalid JSON in config files', () => {
            mockUtils.getZoweFolder.mockReturnValue('C:\\Users\\test\\.zowe');
            mockFs.existsSync.mockReturnValue(true);
            // Invalid JSON should be handled gracefully
            mockFs.readFileSync.mockReturnValue('invalid json content');
            
            provider.setExtensionJson(mockExtensionJson);
            provider['updateConfigVersions'](mockExtensionJson);
            
            const result = provider['shouldShowConfigFetchButtons']();
            
            // Should show buttons since local version defaults to 0 when JSON parsing fails
            expect(result.zoweConfig).toBe(true);
            expect(result.zoweSchema).toBe(true);
        });
    });

    describe('getFileVersion', () => {
        it('should return version from valid JSON file', () => {
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ "vscode-internal-version": 42 }));
            
            const version = provider['getFileVersion']('C:\\Users\\test\\.zowe\\zowe.config.json');
            
            expect(version).toBe(42);
        });

        it('should return undefined for invalid JSON', () => {
            mockFs.readFileSync.mockReturnValue('invalid json');
            
            const version = provider['getFileVersion']('C:\\Users\\test\\.zowe\\zowe.config.json');
            
            expect(version).toBeUndefined();
        });

        it('should return undefined when file read throws error', () => {
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('File not found');
            });
            
            const version = provider['getFileVersion']('C:\\Users\\test\\.zowe\\zowe.config.json');
            
            expect(version).toBeUndefined();
        });

        it('should return undefined when JSON has no version field', () => {
            mockFs.readFileSync.mockReturnValue(JSON.stringify({ "other": "data", "version": "1.0.0" }));
            
            const version = provider['getFileVersion']('C:\\Users\\test\\.zowe\\zowe.config.json');
            
            // Should return undefined because it looks for "vscode-internal-version", not "version"
            expect(version).toBeUndefined();
        });

        it('should handle empty JSON object', () => {
            mockFs.readFileSync.mockReturnValue(JSON.stringify({}));
            
            const version = provider['getFileVersion']('C:\\Users\\test\\.zowe\\zowe.config.json');
            
            expect(version).toBeUndefined();
        });
    });

    describe('event handling', () => {
        it('should have onDidChangeTreeData event', () => {
            expect(provider.onDidChangeTreeData).toBeDefined();
        });

        it('should fire event when tree data changes', () => {
            const listener = jest.fn();
            provider.onDidChangeTreeData(listener);
            
            provider['_onDidChangeTreeData'].fire();
            
            expect(listener).toHaveBeenCalled();
        });
    });
});