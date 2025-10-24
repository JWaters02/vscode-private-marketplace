import { ExtensionWhitelistManager } from '../ExtensionWhitelistManager';
import * as vscode from 'vscode';

jest.mock('vscode');

describe('ExtensionWhitelistManager', () => {
    let manager: ExtensionWhitelistManager;
    let mockContext: jest.Mocked<vscode.ExtensionContext>;
    let mockGlobalState: jest.Mocked<vscode.Memento>;
    let mockWorkspaceConfig: jest.Mocked<vscode.WorkspaceConfiguration>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockGlobalState = {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(),
        };

        mockContext = {
            globalState: mockGlobalState,
            subscriptions: [],
        } as unknown as jest.Mocked<vscode.ExtensionContext>;

        mockWorkspaceConfig = {
            get: jest.fn(),
            update: jest.fn(),
            has: jest.fn(),
            inspect: jest.fn(),
        };

        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockWorkspaceConfig);

        // Mock vscode.extensions.all
        Object.defineProperty(vscode.extensions, 'all', {
            get: jest.fn(() => []),
            configurable: true,
        });

        manager = new ExtensionWhitelistManager(mockContext);
    });

    afterEach(() => {
        // Ensure complete cleanup after each test
        jest.resetAllMocks();
        mockGlobalState.get.mockReset();
        mockGlobalState.update.mockReset();
        mockWorkspaceConfig.get.mockReset();
        mockWorkspaceConfig.update.mockReset();
    });

    describe('constructor', () => {
        it('should initialize with context', () => {
            expect(manager).toBeDefined();
            expect(manager['context']).toBe(mockContext);
        });
    });

    describe('trackPrivateInstall', () => {
        it('should add extension to private install set and refresh allowed extensions', async () => {
            const extensionId = 'zowe.vscode-extension-for-zowe';
            const refreshSpy = jest.spyOn(manager, 'refreshAllowedExtensions').mockResolvedValue();

            manager.trackPrivateInstall(extensionId);

            expect(manager['installedByPrivateMarketplace'].has(extensionId)).toBe(true);
            expect(refreshSpy).toHaveBeenCalled();
        });

        it('should handle multiple private installs', () => {
            const refreshSpy = jest.spyOn(manager, 'refreshAllowedExtensions').mockResolvedValue();

            manager.trackPrivateInstall('github.copilot');
            manager.trackPrivateInstall('ms-python.python');

            expect(manager['installedByPrivateMarketplace'].has('github.copilot')).toBe(true);
            expect(manager['installedByPrivateMarketplace'].has('ms-python.python')).toBe(true);
            expect(refreshSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe('updateAllWhitelists', () => {
        beforeEach(() => {
            // Reset mocks before each test in this suite
            mockGlobalState.update.mockReset();
        });

        it('should update all whitelists and refresh allowed extensions', async () => {
            const extensionIds = ['zowe.vscode-extension-for-zowe-3.2.1', 'github.copilot-1.338.0'];
            const extraWhitelist = ['broadcommfd.code4z-extension-pack'];
            const allowAllVersions = ['github.copilot', 'github.copilot-chat'];

            await manager.updateAllWhitelists(extensionIds, extraWhitelist, allowAllVersions);

            expect(mockGlobalState.update).toHaveBeenCalledWith(
                'vscode-private-marketplace.whitelistedExtensions',
                ['zowe.vscode-extension-for-zowe-3.2.1', 'github.copilot-1.338.0']
            );
            expect(mockGlobalState.update).toHaveBeenCalledWith(
                'vscode-private-marketplace.extraWhitelist',
                ['broadcommfd.code4z-extension-pack']
            );
            expect(mockGlobalState.update).toHaveBeenCalledWith(
                'vscode-private-marketplace.allowAllVersions',
                ['github.copilot', 'github.copilot-chat']
            );
        });

        it('should handle empty extension ids', async () => {
            await manager.updateAllWhitelists([], ['broadcommfd.code4z-extension-pack'], ['github.copilot']);

            expect(mockGlobalState.update).toHaveBeenCalledWith(
                'vscode-private-marketplace.extraWhitelist',
                ['broadcommfd.code4z-extension-pack']
            );
            expect(mockGlobalState.update).toHaveBeenCalledWith(
                'vscode-private-marketplace.allowAllVersions',
                ['github.copilot']
            );
        });

        it('should handle default parameters', async () => {
            await manager.updateAllWhitelists(['zowe.vscode-extension-for-zowe-3.2.1']);

            expect(mockGlobalState.update).toHaveBeenCalledWith(
                'vscode-private-marketplace.extraWhitelist',
                []
            );
            expect(mockGlobalState.update).toHaveBeenCalledWith(
                'vscode-private-marketplace.allowAllVersions',
                []
            );
        });
    });

    describe('getWhitelist', () => {
        beforeEach(() => {
            // Reset mocks for clean state
            mockGlobalState.get.mockReset();
        });

        describe('Basic Functionality', () => {
            it('should return empty array when no whitelists exist', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual([]);
            });

            it('should return main whitelist when only main whitelist exists', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['zowe.vscode-extension-for-zowe-3.2.1'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual([
                    ['zowe.vscode-extension-for-zowe', '3.2.1']
                ]);
            });

            it('should return extra whitelist when only extra whitelist exists', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return ['broadcommfd.code4z-extension-pack'];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual([
                    ['broadcommfd.code4z-extension-pack', '']
                ]);
            });

            it('should combine main whitelist and extra whitelist', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['github.copilot-1.338.0'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return ['broadcommfd.code4z-extension-pack'];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual(expect.arrayContaining([
                    ['github.copilot', '1.338.0'],
                    ['broadcommfd.code4z-extension-pack', '']
                ]));
                expect(whitelist).toHaveLength(2);
            });
        });

        describe('Version Parsing', () => {
            it('should parse standard semantic versions', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [
                        'ms-python.python-2025.8.0',
                        'github.copilot-1.338.0',
                        'zowe.vscode-extension-for-zowe-3.2.1'
                    ];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual(expect.arrayContaining([
                    ['ms-python.python', '2025.8.0'],
                    ['github.copilot', '1.338.0'],
                    ['zowe.vscode-extension-for-zowe', '3.2.1']
                ]));
            });

            it('should parse versions with platform suffixes', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [
                        'broadcommfd.cobol-language-support-2.4.0-win32-x64',
                        'ms-python.debugpy-2025.8.0-win32-x64',
                        'some.extension-1.0.0-linux-arm64'
                    ];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual(expect.arrayContaining([
                    ['broadcommfd.cobol-language-support', '2.4.0'],
                    ['ms-python.debugpy', '2025.8.0'],
                    ['some.extension', '1.0.0']
                ]));
            });

            it('should parse versions with multiple platform parts', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [
                        'complex.extension-1.2.3-alpha-beta-gamma',
                        'another.extension-4.5.6-rc1-build123'
                    ];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual(expect.arrayContaining([
                    ['complex.extension', '1.2.3'],
                    ['another.extension', '4.5.6']
                ]));
            });

            it('should handle extensions without versions', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [
                        'redhat.vscode-yaml',
                        'eamodio.gitlens',
                        'pkief.material-icon-theme'
                    ];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual(expect.arrayContaining([
                    ['redhat.vscode-yaml', ''],
                    ['eamodio.gitlens', ''],
                    ['pkief.material-icon-theme', '']
                ]));
            });

            it('should handle mixed extensions with and without versions', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [
                        'versioned.extension-1.0.0',
                        'unversioned.extension',
                        'another.versioned-2.3.4'
                    ];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return ['extra.unversioned'];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual(expect.arrayContaining([
                    ['versioned.extension', '1.0.0'],
                    ['unversioned.extension', ''],
                    ['another.versioned', '2.3.4'],
                    ['extra.unversioned', '']
                ]));
            });
        });

        describe('Edge Cases', () => {
            it('should handle duplicate extensions between main and extra whitelist', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['duplicate.extension-1.0.0'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return ['duplicate.extension'];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                // Should only appear once due to Set deduplication in the method
                const extensionNames = whitelist.map(([name]: [string, string]) => name);
                const duplicateCount = extensionNames.filter((name: string) => name === 'duplicate.extension').length;
                expect(duplicateCount).toBe(1);
            });

            it('should handle case sensitivity correctly', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [
                        'UPPERCASE.EXTENSION-1.0.0',
                        'MixedCase.Extension-2.0.0'
                    ];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return ['lowercase.extension'];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual(expect.arrayContaining([
                    ['uppercase.extension', '1.0.0'],
                    ['mixedcase.extension', '2.0.0'],
                    ['lowercase.extension', '']
                ]));
            });

            it('should handle extensions with complex naming patterns', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [
                        'org.sub-org.extension-name-1.0.0',
                        'single-word-extension-2.0.0',
                        'extension.with.many.dots-3.0.0'
                    ];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual(expect.arrayContaining([
                    ['org.sub-org.extension-name', '1.0.0'],
                    ['single-word-extension', '2.0.0'],
                    ['extension.with.many.dots', '3.0.0']
                ]));
            });

            it('should handle empty strings in whitelist arrays', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['', 'valid.extension-1.0.0', ''];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return ['', 'valid.extra'];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                // Should filter out empty strings and only include valid extensions
                expect(whitelist).toEqual(expect.arrayContaining([
                    ['valid.extension', '1.0.0'],
                    ['valid.extra', '']
                ]));
                expect(whitelist).toHaveLength(2);
            });

            it('should handle null/undefined global state gracefully', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return null;
                    if (key === 'vscode-private-marketplace.extraWhitelist') return undefined;
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual([]);
            });
        });

        describe('Real World Scenarios', () => {
            it('should handle typical extension patterns from extensions.json', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [
                        'zowe.vscode-extension-for-zowe-3.2.1',
                        'github.copilot-1.338.0',
                        'ms-python.python-2025.8.0-win32-x64',
                        'broadcommfd.cobol-language-support-2.4.0-win32-x64',
                        'ibm.zopeneditor-5.5.0',
                        'vscode.vscode-zowe-developer-tools-1.2.1'
                    ];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [
                        'broadcommfd.code4z-extension-pack'
                    ];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual(expect.arrayContaining([
                    ['zowe.vscode-extension-for-zowe', '3.2.1'],
                    ['github.copilot', '1.338.0'],
                    ['ms-python.python', '2025.8.0'],
                    ['broadcommfd.cobol-language-support', '2.4.0'],
                    ['ibm.zopeneditor', '5.5.0'],
                    ['vscode.vscode-zowe-developer-tools', '1.2.1'],
                    ['broadcommfd.code4z-extension-pack', '']
                ]));
                expect(whitelist).toHaveLength(7);
            });

            it('should handle large whitelist efficiently', () => {
                const mainExtensions = Array.from({ length: 50 }, (_, i) => `extension${i}-${i}.0.0`);
                const extraExtensions = Array.from({ length: 20 }, (_, i) => `extra${i}`);

                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return mainExtensions;
                    if (key === 'vscode-private-marketplace.extraWhitelist') return extraExtensions;
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toHaveLength(70);
                
                // Verify first few entries are parsed correctly
                expect(whitelist).toEqual(expect.arrayContaining([
                    ['extension0', '0.0.0'],
                    ['extension1', '1.0.0'],
                    ['extra0', ''],
                    ['extra1', '']
                ]));
            });
        });

        describe('Version Regex Pattern Validation', () => {
            it('should correctly match version pattern at end of string', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [
                        'extension-1.0.0',
                        'extension-1.0.0-suffix',
                        'extension-name-with-1.0.0-numbers',
                        'extension.with.1.0.0.in.middle-2.0.0'
                    ];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual(expect.arrayContaining([
                    ['extension', '1.0.0'],
                    ['extension', '1.0.0'],
                    ['extension-name-with', '1.0.0'],
                    ['extension.with.1.0.0.in.middle', '2.0.0']
                ]));
            });

            it('should handle pre-release and build versions correctly', () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [
                        'extension1-1.0.0-alpha.1',
                        'extension2-2.0.0-beta.2-build.123',
                        'extension3-3.0.0-rc.1-win32-x64'
                    ];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    return undefined;
                });

                const whitelist = (manager as any).getWhitelist();

                expect(whitelist).toEqual(expect.arrayContaining([
                    ['extension1', '1.0.0'],
                    ['extension2', '2.0.0'],
                    ['extension3', '3.0.0']
                ]));
            });
        });
    });

    describe('refreshAllowedExtensions', () => {
        beforeEach(() => {
            // Complete reset of all mocks for isolation
            jest.resetAllMocks();
            mockGlobalState.get.mockReset();
            mockGlobalState.update.mockReset();
            mockWorkspaceConfig.get.mockReset();
            mockWorkspaceConfig.update.mockReset();

            // Re-setup the basic mocks
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockWorkspaceConfig);

            // Mock getCurrentExtensions to return empty by default
            jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({});

            // Reset workspace config to empty state
            mockWorkspaceConfig.get.mockReturnValue({});

            // Mock globalState.get to return empty arrays by default for ALL keys
            mockGlobalState.get.mockImplementation((key: string) => {
                // Always return empty arrays/false for all keys unless specifically overridden
                if (key === 'vscode-private-marketplace.debug') return false;
                if (key === 'vscode-private-marketplace.whitelistedExtensions') return [];
                if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                return undefined;
            });
        });

        describe('Debug Mode Scenarios', () => {
            it('should allow all extensions when debug mode is enabled', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return true;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['zowe.vscode-extension-for-zowe-3.2.1'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    '*',
                    vscode.ConfigurationTarget.Global
                );
            });
        });

        describe('Empty Whitelist Scenarios', () => {
            it('should allow all extensions when whitelist is empty', async () => {
                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    '*',
                    vscode.ConfigurationTarget.Global
                );
            });

            it('should allow all extensions when whitelist only contains extra whitelist items', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return ['broadcommfd.code4z-extension-pack'];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    '*',
                    vscode.ConfigurationTarget.Global
                );
            });
        });

        describe('Extension Matching Scenarios', () => {
            it('should handle extension with exact version match', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['zowe.vscode-extension-for-zowe-3.2.1'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'zowe.vscode-extension-for-zowe': '3.2.1'
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'zowe.vscode-extension-for-zowe': ['3.2.1']
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });

            // This is commented out because I'm not sure if this should still be kept
            // The thing is that this would be nice however if the user has the extension of non-whitelisted version installed, 
            // it would be blocked which would be a pain in the arse.
            // But once the user is "on" the whitelisted versions this won't become an issue as they won't be able to install
            // any other versions. 
            // it('should block extension with version mismatch', async () => {
            //     mockGlobalState.get.mockImplementation((key) => {
            //         if (key === 'vscode-private-marketplace.debug') return false;
            //         if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['github.copilot-1.338.0'];
            //         if (key === 'vscode-private-marketplace.extraWhitelist') return [];
            //         if (key === 'vscode-private-marketplace.allowAllVersions') return [];
            //         return undefined;
            //     });

            //     jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
            //         'github.copilot': '1.300.0'
            //     });

            //     await manager.refreshAllowedExtensions();

            //     expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
            //         'extensions.allowed',
            //         expect.objectContaining({
            //             'github.copilot': false
            //         }),
            //         vscode.ConfigurationTarget.Global
            //     );
            // });

            it('should allow all versions when whitelist has empty version', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['ms-python.python'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'ms-python.python': '2025.8.0'
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'ms-python.python': true
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });
        });

        describe('Allow All Versions Scenarios', () => {
            it('should allow all versions for extensions in allowAllVersions list', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['github.copilot-1.338.0'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return ['github.copilot'];
                    return undefined;
                });

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'github.copilot': '1.400.0'
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'github.copilot': true
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });

            it('should override version mismatch for allowAllVersions extensions', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['github.copilot-chat-0.28.5'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return ['github.copilot-chat'];
                    return undefined;
                });

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'github.copilot-chat': '0.30.0'
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'github.copilot-chat': true
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });
        });

        describe('Non-Installed Extension Scenarios', () => {
            it('should allow non-installed extension with specific version', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['ms-playwright.playwright-1.1.15'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'ms-playwright.playwright': ['1.1.15']
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });

            it('should allow non-installed extension with no version restriction', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['eamodio.gitlens'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'eamodio.gitlens': true
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });
        });

        describe('Rolling Version List Scenarios', () => {
            it('should merge new version with existing allowed versions', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['ibm.zopeneditor-5.5.0'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({
                    'ibm.zopeneditor': ['5.0.0', '5.2.0']
                });

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'ibm.zopeneditor': '5.3.0'
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'ibm.zopeneditor': expect.arrayContaining(['5.0.0', '5.2.0', '5.5.0', '5.3.0'])
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });

            it('should override rolling versions with allowAllVersions', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['vscode.vscode-zowe-developer-tools-1.2.1'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return ['vscode.vscode-zowe-developer-tools'];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({
                    'vscode.vscode-zowe-developer-tools': ['1.0.0']
                });

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'vscode.vscode-zowe-developer-tools': '1.1.0'
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'vscode.vscode-zowe-developer-tools': true
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });

            it('should handle rolling versions without matching installed extension', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['broadcommfd.hlasm-language-support-1.17.0'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({
                    'broadcommfd.hlasm-language-support': ['1.15.0']
                });

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({});

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'broadcommfd.hlasm-language-support': expect.arrayContaining(['1.15.0', '1.17.0'])
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });
        });

        describe('Extension Blocking Scenarios', () => {
            it('should block installed extensions not on whitelist', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['zowe.vscode-extension-for-zowe-3.2.1'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'zowe.vscode-extension-for-zowe': '3.2.1',
                    'unauthorized.extension': '1.0.0',
                    'malicious.addon': '2.0.0'
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'zowe.vscode-extension-for-zowe': ['3.2.1'],
                        'unauthorized.extension': false,
                        'malicious.addon': false
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });

            it('should not block VS Code built-in extensions', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['github.copilot-1.338.0'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'github.copilot': '1.338.0',
                    'vscode.typescript-language-features': '1.0.0',
                    'vscode.json-language-features': '1.0.0',
                    'unauthorized.extension': '1.0.0'
                });

                await manager.refreshAllowedExtensions();

                const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                expect(updateCall).toEqual(expect.objectContaining({
                    'github.copilot': ['1.338.0'],
                    'unauthorized.extension': false
                }));
                expect(updateCall).not.toHaveProperty('vscode.typescript-language-features');
                expect(updateCall).not.toHaveProperty('vscode.json-language-features');
            });

            it('should not block extensions in allowAllVersions list', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['ms-python.python-2025.8.0-win32-x64'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return ['vscode.vscode-private-marketplace'];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'ms-python.python': '2025.8.0',
                    'vscode.vscode-private-marketplace': '1.0.0',
                    'unauthorized.extension': '1.0.0'
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'ms-python.python': ['2025.8.0'],
                        'unauthorized.extension': false
                    }),
                    vscode.ConfigurationTarget.Global
                );
                expect(mockWorkspaceConfig.update).not.toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'vscode.vscode-private-marketplace': false
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });
        });

        describe('Complex Version Parsing Scenarios', () => {
            it('should parse version with platform suffix', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['broadcommfd.cobol-language-support-2.4.0-win32-x64'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'broadcommfd.cobol-language-support': '2.4.0'
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'broadcommfd.cobol-language-support': ['2.4.0']
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });

            it('should handle extension ID with no version', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['redhat.vscode-yaml'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'redhat.vscode-yaml': '1.18.0'
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'redhat.vscode-yaml': true
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });

            it('should handle complex version patterns', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [
                        'zowe.cics-extension-for-zowe-3.8.0',
                        'ms-python.debugpy-2025.8.0-win32-x64',
                        'bitlang.vscode-crosshair-0.5.0'
                    ];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'zowe.cics-extension-for-zowe': '3.8.0',
                    'ms-python.debugpy': '2025.8.0',
                    'bitlang.vscode-crosshair': '0.5.0'
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'zowe.cics-extension-for-zowe': ['3.8.0'],
                        'ms-python.debugpy': ['2025.8.0'],
                        'bitlang.vscode-crosshair': ['0.5.0']
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });
        });

        describe('State Management Scenarios', () => {
            it('should update known extensions state', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                const currentExtensions = {
                    'zowe.vscode-extension-for-zowe': '3.2.1',
                    'github.copilot': '1.338.0'
                };

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue(currentExtensions);

                await manager.refreshAllowedExtensions();

                expect(mockGlobalState.update).toHaveBeenCalledWith(
                    'vscode-private-marketplace.knownExtensions',
                    currentExtensions
                );
            });

            it('should clear private marketplace tracking', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                manager.trackPrivateInstall('ms-playwright.playwright');
                expect(manager['installedByPrivateMarketplace'].has('ms-playwright.playwright')).toBe(true);

                await manager.refreshAllowedExtensions();

                expect(manager['installedByPrivateMarketplace'].has('ms-playwright.playwright')).toBe(false);
            });
        });

        describe('Edge Cases', () => {
            it('should handle case-insensitive extension matching', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['YZHANG.MARKDOWN-ALL-IN-ONE-3.6.3'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'yzhang.markdown-all-in-one': '3.6.3'
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'yzhang.markdown-all-in-one': ['3.6.3']
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });

            it('should handle duplicate extensions in whitelist', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['pkief.material-icon-theme-5.24.0', 'pkief.material-icon-theme-5.24.0'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'pkief.material-icon-theme': '5.24.0'
                });

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'pkief.material-icon-theme': ['5.24.0']
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });

            it('should handle empty current extensions', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['orta.vscode-jest-6.4.3'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({});

                await manager.refreshAllowedExtensions();

                expect(mockWorkspaceConfig.update).toHaveBeenCalledWith(
                    'extensions.allowed',
                    expect.objectContaining({
                        'orta.vscode-jest': ['6.4.3']
                    }),
                    vscode.ConfigurationTarget.Global
                );
            });
        });

        describe('SNAPSHOT Extension Handling', () => {
            it('should not block extensions with -SNAPSHOT suffix even if not in whitelist', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['zowe.vscode-extension-for-zowe-3.2.1'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'zowe.vscode-extension-for-zowe': '3.2.1-SNAPSHOT',
                    'some.other.extension': '1.0.0-SNAPSHOT'
                });

                await manager.refreshAllowedExtensions();

                const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                // SNAPSHOT extensions should not be blocked
                expect(updateCall['zowe.vscode-extension-for-zowe']).not.toBe(false);
                expect(updateCall['some.other.extension']).not.toBe(false);
            });

            it('should handle -SNAPSHOT versions in version matching logic', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['zowe.vscode-extension-for-zowe-3.2.1'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'zowe.vscode-extension-for-zowe': '3.2.1-SNAPSHOT'
                });

                await manager.refreshAllowedExtensions();

                const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                // Should allow SNAPSHOT version even if base version matches whitelist
                expect(updateCall['zowe.vscode-extension-for-zowe']).toBeTruthy();
            });
        });

        describe('Rolling Versions with Higher Installed Versions', () => {
            it('should not block installed version higher than whitelist when rolling versions exist', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['github.copilot-1.338.0'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                // Simulate existing rolling versions with older versions
                mockWorkspaceConfig.get.mockReturnValue({
                    'github.copilot': ['1.300.0', '1.320.0']
                });

                // Current installed version is higher than whitelist
                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'github.copilot': '1.400.0'
                });

                await manager.refreshAllowedExtensions();

                const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                // Should include all versions: old rolling + whitelist + current installed
                expect(updateCall['github.copilot']).toEqual(
                    expect.arrayContaining(['1.300.0', '1.320.0', '1.338.0', '1.400.0'])
                );
            });

            it('should preserve higher installed version when whitelist version is lower', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['ms-python.python-2020.1.0'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                // Installed version is much higher than whitelist
                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'ms-python.python': '2025.8.0'
                });

                await manager.refreshAllowedExtensions();

                const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                // Should not block the extension, should allow the installed version
                expect(updateCall['ms-python.python']).not.toBe(false);
            });
        });

        describe('AllowAllVersions Contamination Bug', () => {
            it('should not add version restrictions to allowAllVersions extensions on subsequent runs', async () => {
                // First run - extension should be set to true
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['vscode.vscode-zowe-developer-tools-1.2.1'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return ['vscode.vscode-zowe-developer-tools'];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'vscode.vscode-zowe-developer-tools': '1.2.1'
                });

                await manager.refreshAllowedExtensions();

                let updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                expect(updateCall['vscode.vscode-zowe-developer-tools']).toBe(true);

                // Reset mocks for second run
                mockWorkspaceConfig.update.mockClear();

                // Second run - simulate existing config from first run
                mockWorkspaceConfig.get.mockReturnValue({
                    'vscode.vscode-zowe-developer-tools': true
                });

                await manager.refreshAllowedExtensions();

                updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                // Should still be true, not an array with version
                expect(updateCall['vscode.vscode-zowe-developer-tools']).toBe(true);
                expect(Array.isArray(updateCall['vscode.vscode-zowe-developer-tools'])).toBe(false);
            });
        });

        describe('Extension Name Matching Issues', () => {
            it('should match extensions without org qualifier to whitelist with org qualifier', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['vscode.vscode-private-marketplace-1.0.0'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                // Installed extension ID doesn't have org prefix
                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'vscode-private-marketplace': '1.0.0'
                });

                await manager.refreshAllowedExtensions();

                const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                // Should match and allow the extension
                expect(updateCall['vscode-private-marketplace']).toEqual(['1.0.0']);
            });

            it('should match extensions with org qualifier to whitelist without org qualifier', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['private-marketplace-1.0.0'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({});

                // Installed extension ID has org prefix
                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'vscode.private-marketplace': '1.0.0'
                });

                await manager.refreshAllowedExtensions();

                const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                // Should match and allow the extension
                expect(updateCall['vscode.private-marketplace']).toEqual(['1.0.0']);
            });
        });

        describe('Version Mismatch Edge Cases', () => {
            it('should handle installed version same as local state but higher than server whitelist', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['github.copilot-1.300.0']; // Lower server version
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                // Local state has higher version that was previously allowed
                mockWorkspaceConfig.get.mockReturnValue({
                    'github.copilot': ['1.350.0']
                });

                // Current installed version matches local state but is higher than server
                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'github.copilot': '1.350.0'
                });

                await manager.refreshAllowedExtensions();

                const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                // Should preserve the existing allowed version and add server version
                expect(updateCall['github.copilot']).toEqual(
                    expect.arrayContaining(['1.350.0', '1.300.0'])
                );
            });

            it('should not block extension when current version exists in rolling list', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['ms-python.python-2025.1.0'];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                    return undefined;
                });

                // Rolling versions include the currently installed version
                mockWorkspaceConfig.get.mockReturnValue({
                    'ms-python.python': ['2024.8.0', '2024.12.0', '2025.2.0']
                });

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'ms-python.python': '2025.2.0' // This version is in rolling list
                });

                await manager.refreshAllowedExtensions();

                const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                // Should preserve all versions including the current one
                expect(updateCall['ms-python.python']).toEqual(
                    expect.arrayContaining(['2024.8.0', '2024.12.0', '2025.2.0', '2025.1.0'])
                );
            });
        });

        describe('Complex Scenario Integration Tests', () => {
            it('should handle multiple extensions with mixed scenarios in single refresh', async () => {
                mockGlobalState.get.mockImplementation((key) => {
                    if (key === 'vscode-private-marketplace.debug') return false;
                    if (key === 'vscode-private-marketplace.whitelistedExtensions') return [
                        'github.copilot-1.300.0', // Lower than installed
                        'ms-python.python-2025.8.0', // Exact match
                        'zowe.vscode-extension-for-zowe-3.2.1' // Base version, but SNAPSHOT installed
                    ];
                    if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                    if (key === 'vscode-private-marketplace.allowAllVersions') return ['vscode.vscode-zowe-developer-tools'];
                    return undefined;
                });

                mockWorkspaceConfig.get.mockReturnValue({
                    'github.copilot': ['1.250.0'], // Has rolling versions
                    'unauthorized.extension': false // Previously blocked
                });

                jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                    'github.copilot': '1.350.0', // Higher than whitelist
                    'ms-python.python': '2025.8.0', // Exact match
                    'zowe.vscode-extension-for-zowe': '3.2.1-SNAPSHOT', // SNAPSHOT version
                    'vscode.vscode-zowe-developer-tools': '1.2.1', // In allowAllVersions
                    'unauthorized.extension': '1.0.0', // Not in whitelist
                    'vscode.typescript': '1.0.0' // VS Code built-in
                });

                await manager.refreshAllowedExtensions();

                const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];

                // Verify each extension is handled correctly
                expect(updateCall['github.copilot']).toEqual(expect.arrayContaining(['1.250.0', '1.300.0', '1.350.0']));
                expect(updateCall['ms-python.python']).toEqual(['2025.8.0']);
                expect(updateCall['zowe.vscode-extension-for-zowe']).not.toBe(false); // SNAPSHOT should not be blocked
                expect(updateCall['vscode.vscode-zowe-developer-tools']).toBe(true); // allowAllVersions
                expect(updateCall['unauthorized.extension']).toBe(false); // Should be blocked
                expect(updateCall).not.toHaveProperty('vscode.typescript'); // Built-in should be ignored
            });
        });

                describe('Existing Extensions.Allowed Configuration Scenarios', () => {
            describe('Overwriting Existing Configuration', () => {
                it('should overwrite existing simple allowed extension when whitelist updates', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['github.copilot-1.400.0'];
                        if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                        if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                        return undefined;
                    });

                    // Existing config allows older version
                    mockWorkspaceConfig.get.mockReturnValue({
                        'github.copilot': ['1.300.0']
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'github.copilot': '1.350.0'
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    // Should merge existing, current installed, and new whitelist versions
                    expect(updateCall['github.copilot']).toEqual(
                        expect.arrayContaining(['1.300.0', '1.350.0', '1.400.0'])
                    );
                });

                it('should overwrite existing "true" configuration with specific versions', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['ms-python.python-2025.8.0'];
                        if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                        if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                        return undefined;
                    });

                    // Existing config allows all versions
                    mockWorkspaceConfig.get.mockReturnValue({
                        'ms-python.python': true
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'ms-python.python': '2025.8.0'
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    // Should change from "true" to specific version array
                    expect(updateCall['ms-python.python']).toEqual(['2025.8.0']);
                });

                it('should preserve existing blocked extensions that are still not whitelisted', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['approved.extension-1.0.0'];
                        if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                        if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                        return undefined;
                    });

                    // Existing config has blocked extension
                    mockWorkspaceConfig.get.mockReturnValue({
                        'approved.extension': ['1.0.0'],
                        'blocked.extension': false
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'approved.extension': '1.0.0',
                        'blocked.extension': '1.0.0'
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    expect(updateCall['approved.extension']).toEqual(['1.0.0']);
                    expect(updateCall['blocked.extension']).toBe(false);
                });
            });

            describe('AllowAllVersions Status Changes', () => {
                it('should change from allowAllVersions=true to specific versions when removed from allowAllVersions', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['github.copilot-1.400.0'];
                        if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                        if (key === 'vscode-private-marketplace.allowAllVersions') return []; // No longer in allowAllVersions
                        return undefined;
                    });

                    // Previously was allowed all versions
                    mockWorkspaceConfig.get.mockReturnValue({
                        'github.copilot': true
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'github.copilot': '1.350.0'
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    // Should change from "true" to version array with current and whitelist versions
                    expect(updateCall['github.copilot']).toEqual(
                        expect.arrayContaining(['1.350.0', '1.400.0'])
                    );
                });

                it('should change from specific versions to allowAllVersions=true when added to allowAllVersions', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['github.copilot-chat-0.30.0'];
                        if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                        if (key === 'vscode-private-marketplace.allowAllVersions') return ['github.copilot-chat']; // Now in allowAllVersions
                        return undefined;
                    });

                    // Previously had specific versions
                    mockWorkspaceConfig.get.mockReturnValue({
                        'github.copilot-chat': ['0.25.0', '0.28.0']
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'github.copilot-chat': '0.29.0'
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    // Should change to "true" since it's now in allowAllVersions
                    expect(updateCall['github.copilot-chat']).toBe(true);
                });

                it('should maintain allowAllVersions=true when still in allowAllVersions list', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['vscode.vscode-private-marketplace-1.0.0'];
                        if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                        if (key === 'vscode-private-marketplace.allowAllVersions') return ['vscode.vscode-private-marketplace'];
                        return undefined;
                    });

                    // Already was allowed all versions
                    mockWorkspaceConfig.get.mockReturnValue({
                        'vscode.vscode-private-marketplace': true
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'vscode.vscode-private-marketplace': '1.0.0'
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    // Should remain "true"
                    expect(updateCall['vscode.vscode-private-marketplace']).toBe(true);
                });
            });

            describe('ExtraWhitelist Status Changes', () => {
                it('should add extension to allowed when added to extraWhitelist', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['approved.extension-1.0.0'];
                        if (key === 'vscode-private-marketplace.extraWhitelist') return ['broadcommfd.code4z-extension-pack']; // Now in extraWhitelist
                        if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                        return undefined;
                    });

                    // Previously was blocked or not configured
                    mockWorkspaceConfig.get.mockReturnValue({
                        'approved.extension': ['1.0.0'],
                        'broadcommfd.code4z-extension-pack': false
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'approved.extension': '1.0.0',
                        'broadcommfd.code4z-extension-pack': '1.2.0'
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    expect(updateCall['approved.extension']).toEqual(['1.0.0']);
                    // Should now be allowed (true since extraWhitelist items don't have versions)
                    expect(updateCall['broadcommfd.code4z-extension-pack']).toBe(true);
                });

                it('should block extension when removed from extraWhitelist and not in main whitelist', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['approved.extension-1.0.0'];
                        if (key === 'vscode-private-marketplace.extraWhitelist') return []; // No longer in extraWhitelist
                        if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                        return undefined;
                    });

                    // Previously was allowed via extraWhitelist
                    mockWorkspaceConfig.get.mockReturnValue({
                        'approved.extension': ['1.0.0'],
                        'previously.extra.extension': true
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'approved.extension': '1.0.0',
                        'previously.extra.extension': '1.0.0'
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    expect(updateCall['approved.extension']).toEqual(['1.0.0']);
                    // Should now be blocked since it's not in extraWhitelist anymore
                    expect(updateCall['previously.extra.extension']).toBe(false);
                });
            });

            describe('Main Whitelist Changes', () => {
                it('should block extension when removed from main whitelist', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['still.approved-1.0.0']; // removed.extension no longer here
                        if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                        if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                        return undefined;
                    });

                    // Previously had multiple extensions allowed
                    mockWorkspaceConfig.get.mockReturnValue({
                        'still.approved': ['1.0.0'],
                        'removed.extension': ['2.0.0']
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'still.approved': '1.0.0',
                        'removed.extension': '2.0.0'
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    expect(updateCall['still.approved']).toEqual(['1.0.0']);
                    // Should now be blocked
                    expect(updateCall['removed.extension']).toBe(false);
                });

                it('should add extension when added to main whitelist', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['existing.extension-1.0.0', 'new.extension-2.0.0']; // new.extension added
                        if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                        if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                        return undefined;
                    });

                    // Previously only had one extension
                    mockWorkspaceConfig.get.mockReturnValue({
                        'existing.extension': ['1.0.0']
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'existing.extension': '1.0.0'
                        // new.extension not installed yet
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    expect(updateCall['existing.extension']).toEqual(['1.0.0']);
                    // Should now be allowed for future installation
                    expect(updateCall['new.extension']).toEqual(['2.0.0']);
                });
            });

            describe('Version Updates in Whitelist', () => {
                it('should add new version to rolling list when whitelist version updates', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['github.copilot-1.400.0']; // Updated from 1.300.0
                        if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                        if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                        return undefined;
                    });

                    // Had older whitelist version
                    mockWorkspaceConfig.get.mockReturnValue({
                        'github.copilot': ['1.250.0', '1.300.0'] // Rolling list with old versions
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'github.copilot': '1.350.0'
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    // Should add new whitelist version to existing rolling list
                    expect(updateCall['github.copilot']).toEqual(
                        expect.arrayContaining(['1.250.0', '1.300.0', '1.350.0', '1.400.0'])
                    );
                });

                it('should not duplicate versions in rolling list', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['ms-python.python-2025.8.0'];
                        if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                        if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                        return undefined;
                    });

                    // Already has the same version in rolling list
                    mockWorkspaceConfig.get.mockReturnValue({
                        'ms-python.python': ['2025.6.0', '2025.8.0'] // Already contains the whitelist version
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'ms-python.python': '2025.8.0'
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    // Should not duplicate the version
                    expect(updateCall['ms-python.python']).toEqual(['2025.6.0', '2025.8.0']);
                    expect(updateCall['ms-python.python']).toHaveLength(2);
                });
            });

            describe('Complex Transition Scenarios', () => {
                it('should handle extension moving from extraWhitelist to main whitelist with version', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['promoted.extension-1.0.0']; // Now in main whitelist
                        if (key === 'vscode-private-marketplace.extraWhitelist') return []; // No longer in extraWhitelist
                        if (key === 'vscode-private-marketplace.allowAllVersions') return [];
                        return undefined;
                    });

                    // Previously was in extraWhitelist (allowed=true)
                    mockWorkspaceConfig.get.mockReturnValue({
                        'promoted.extension': true
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'promoted.extension': '1.0.0'
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    // Should change from "true" to specific version array
                    expect(updateCall['promoted.extension']).toEqual(['1.0.0']);
                });

                it('should handle extension moving from main whitelist to allowAllVersions', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return ['promoted.extension-1.0.0']; // Still in main whitelist
                        if (key === 'vscode-private-marketplace.extraWhitelist') return [];
                        if (key === 'vscode-private-marketplace.allowAllVersions') return ['promoted.extension']; // Now also in allowAllVersions
                        return undefined;
                    });

                    // Previously had specific versions
                    mockWorkspaceConfig.get.mockReturnValue({
                        'promoted.extension': ['0.8.0', '1.0.0']
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'promoted.extension': '1.1.0'
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    // Should change to "true" due to allowAllVersions
                    expect(updateCall['promoted.extension']).toBe(true);
                });

                it('should handle multiple simultaneous transitions', async () => {
                    mockGlobalState.get.mockImplementation((key) => {
                        if (key === 'vscode-private-marketplace.debug') return false;
                        if (key === 'vscode-private-marketplace.whitelistedExtensions') return [
                            'stable.extension-2.0.0', // Version updated
                            'promoted.extension-1.0.0' // Moved from extraWhitelist
                        ];
                        if (key === 'vscode-private-marketplace.extraWhitelist') return ['new.extra-extension']; // New in extra
                        if (key === 'vscode-private-marketplace.allowAllVersions') return ['flexible.extension']; // Moved to allowAll
                        return undefined;
                    });

                    // Complex existing state
                    mockWorkspaceConfig.get.mockReturnValue({
                        'stable.extension': ['1.8.0', '1.9.0'], // Will get new version added
                        'promoted.extension': true, // Was in extraWhitelist, now specific version
                        'flexible.extension': ['1.0.0', '1.1.0'], // Will become allowAll
                        'removed.extension': ['1.0.0'], // Will be blocked
                        'new.extra-extension': false // Will be unblocked
                    });

                    jest.spyOn(manager as any, 'getCurrentExtensions').mockReturnValue({
                        'stable.extension': '1.9.5',
                        'promoted.extension': '1.0.0',
                        'flexible.extension': '1.2.0',
                        'removed.extension': '1.0.0',
                        'new.extra-extension': '1.0.0'
                    });

                    await manager.refreshAllowedExtensions();

                    const updateCall = mockWorkspaceConfig.update.mock.calls[0][1];
                    
                    // Verify all transitions
                    expect(updateCall['stable.extension']).toEqual(
                        expect.arrayContaining(['1.8.0', '1.9.0', '1.9.5', '2.0.0'])
                    );
                    expect(updateCall['promoted.extension']).toEqual(['1.0.0']);
                    expect(updateCall['flexible.extension']).toBe(true);
                    expect(updateCall['removed.extension']).toBe(false);
                    expect(updateCall['new.extra-extension']).toBe(true);
                });
            });
        });
    });
});