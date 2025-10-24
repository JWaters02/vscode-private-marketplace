import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Utils } from '../utils';

jest.mock('vscode');
jest.mock('fs');
jest.mock('path');
jest.mock('os');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockOs = os as jest.Mocked<typeof os>;
const mockVscode = vscode as jest.Mocked<typeof vscode>;

// Mock console to avoid pollution in test output
const mockConsole = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
};
global.console = mockConsole as any;

describe('Utils', () => {
    const mockDownloadsFolder = 'C:\\Users\\test\\Downloads';
    const mockHomeDir = 'C:\\Users\\test';

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock basic path operations
        (mockPath.join as jest.Mock).mockImplementation((...args: string[]) => args.join('\\'));
        (mockPath.resolve as jest.Mock).mockImplementation((p: string) => p);
        (mockOs.homedir as jest.Mock).mockReturnValue(mockHomeDir);
        
        // Mock workspace configuration
        const mockConfiguration = {
            get: jest.fn()
        };
        const mockWorkspace = {
            getConfiguration: jest.fn().mockReturnValue(mockConfiguration)
        };
        (mockVscode as any).workspace = mockWorkspace;
        
        // Mock default behavior for getDownloadsFolder
        mockConfiguration.get.mockReturnValue(undefined);
    });

    describe('pollDownloadedFile', () => {
        beforeEach(() => {
            // Set up a proper spy for getDownloadsFolder
            jest.spyOn(Utils, 'getDownloadsFolder').mockReturnValue(mockDownloadsFolder);
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('should find exact filename match', async () => {
            const filename = 'zowe.config.json';
            const expectedPath = `${mockDownloadsFolder}\\${filename}`;
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue([filename, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });

            const result = await Utils.pollDownloadedFile(filename, 1000, 100);

            expect(result).toBe(expectedPath);
            expect(mockFs.readdirSync).toHaveBeenCalledWith(mockDownloadsFolder);
        });

        it('should find Windows duplicate file with (1) suffix', async () => {
            const filename = 'zowe.config.json';
            const duplicateFile = 'zowe.config (1).json';
            const expectedPath = `${mockDownloadsFolder}\\${duplicateFile}`;
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue([duplicateFile, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });

            const result = await Utils.pollDownloadedFile(filename, 1000, 100);

            expect(result).toBe(expectedPath);
        });

        it('should find Windows duplicate file with (2) suffix', async () => {
            const filename = 'zowe.config.json';
            const duplicateFile = 'zowe.config (2).json';
            const expectedPath = `${mockDownloadsFolder}\\${duplicateFile}`;
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue([duplicateFile, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });

            const result = await Utils.pollDownloadedFile(filename, 1000, 100);

            expect(result).toBe(expectedPath);
        });

        it('should return the newest file when multiple duplicates exist', async () => {
            const filename = 'zowe.config.json';
            const originalFile = 'zowe.config.json';
            const duplicateFile1 = 'zowe.config (1).json';
            const duplicateFile2 = 'zowe.config (2).json';
            
            const oldTime = Date.now() - 10000;
            const middleTime = Date.now() - 5000;
            const newTime = Date.now();
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue([originalFile, duplicateFile1, duplicateFile2, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes(originalFile)) return { mtimeMs: oldTime };
                if (filePath.includes(duplicateFile1)) return { mtimeMs: middleTime };
                if (filePath.includes(duplicateFile2)) return { mtimeMs: newTime };
                return { mtimeMs: 0 };
            });

            const result = await Utils.pollDownloadedFile(filename, 1000, 100);

            expect(result).toBe(`${mockDownloadsFolder}\\${duplicateFile2}`);
        });

        it('should handle case-insensitive matching', async () => {
            const filename = 'ZOWE.CONFIG.JSON';
            const actualFile = 'zowe.config.json';
            const expectedPath = `${mockDownloadsFolder}\\${actualFile}`;
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue([actualFile, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });

            const result = await Utils.pollDownloadedFile(filename, 1000, 100);

            expect(result).toBe(expectedPath);
        });

        it('should handle case-insensitive matching for duplicates', async () => {
            const filename = 'ZOWE.CONFIG.JSON';
            const duplicateFile = 'zowe.config (1).json';
            const expectedPath = `${mockDownloadsFolder}\\${duplicateFile}`;
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue([duplicateFile, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });

            const result = await Utils.pollDownloadedFile(filename, 1000, 100);

            expect(result).toBe(expectedPath);
        });

        it('should return undefined when file is not found within timeout', async () => {
            const filename = 'zowe.config.json';
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue(['other-file.txt', 'another-file.pdf']);

            const result = await Utils.pollDownloadedFile(filename, 100, 50);

            expect(result).toBeUndefined();
        });

        it('should continue polling until file appears', async () => {
            const filename = 'zowe.config.json';
            const expectedPath = `${mockDownloadsFolder}\\${filename}`;
            let callCount = 0;
            
            (mockFs.readdirSync as jest.Mock).mockImplementation(() => {
                callCount++;
                if (callCount >= 3) {
                    return [filename];
                }
                return ['other-file.txt'];
            });
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });

            const result = await Utils.pollDownloadedFile(filename, 1000, 100);

            expect(result).toBe(expectedPath);
            expect(mockFs.readdirSync).toHaveBeenCalledTimes(3);
        });

        it('should handle .vsix files with Windows duplicate naming', async () => {
            const filename = 'my-extension.vsix';
            const duplicateFile = 'my-extension (1).vsix';
            const expectedPath = `${mockDownloadsFolder}\\${duplicateFile}`;
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue([duplicateFile, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });

            const result = await Utils.pollDownloadedFile(filename, 1000, 100);

            expect(result).toBe(expectedPath);
        });

        it('should prioritize newest file among original and duplicates', async () => {
            const filename = 'my-extension.vsix';
            const originalFile = 'my-extension.vsix';
            const duplicateFile1 = 'my-extension (1).vsix';
            const duplicateFile2 = 'my-extension (2).vsix';
            const duplicateFile3 = 'my-extension (3).vsix';
            
            const baseTime = Date.now();
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue([
                originalFile, 
                duplicateFile1, 
                duplicateFile2, 
                duplicateFile3,
                'unrelated-file.txt'
            ]);
            
            (mockFs.statSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes('my-extension.vsix') && !filePath.includes('(')) {
                    return { mtimeMs: baseTime - 30000 }; // oldest
                }
                if (filePath.includes('(1)')) return { mtimeMs: baseTime - 20000 };
                if (filePath.includes('(2)')) return { mtimeMs: baseTime }; // newest
                if (filePath.includes('(3)')) return { mtimeMs: baseTime - 10000 };
                return { mtimeMs: 0 };
            });

            const result = await Utils.pollDownloadedFile(filename, 1000, 100);

            expect(result).toBe(`${mockDownloadsFolder}\\${duplicateFile2}`);
        });

        it('should handle edge case where duplicate has different casing', async () => {
            const filename = 'Test.Config.json';
            const duplicateFile = 'test.config (1).json';
            const expectedPath = `${mockDownloadsFolder}\\${duplicateFile}`;
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue([duplicateFile, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });

            const result = await Utils.pollDownloadedFile(filename, 1000, 100);

            expect(result).toBe(expectedPath);
        });

        it('should not match files that start with filename but are different files', async () => {
            const filename = 'config.json';
            const nonMatchingFiles = [
                'config.json.backup',
                'config.json.old',
                'configurer.json',
                'my-config.json'
            ];
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue([...nonMatchingFiles, 'other-file.txt']);

            const result = await Utils.pollDownloadedFile(filename, 100, 50);

            expect(result).toBeUndefined();
        });

        it('should handle very high duplicate numbers', async () => {
            const filename = 'test.json';
            const duplicateFile = 'test (157).json';
            const expectedPath = `${mockDownloadsFolder}\\${duplicateFile}`;
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue([duplicateFile, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });

            const result = await Utils.pollDownloadedFile(filename, 1000, 100);

            expect(result).toBe(expectedPath);
        });
    });

    describe('pollAndValidateConfigFile', () => {
        beforeEach(() => {
            jest.spyOn(Utils, 'getDownloadsFolder').mockReturnValue(mockDownloadsFolder);
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('should find and validate config file with correct version', async () => {
            const filename = 'zowe.config.json';
            const expectedVersion = 5;
            const configFile = 'zowe.config.json';
            const expectedPath = `${mockDownloadsFolder}\\${configFile}`;
            const configContent = JSON.stringify({ 'vscode-internal-version': 5 });

            (mockFs.readdirSync as jest.Mock).mockReturnValue([configFile, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });
            (mockFs.readFileSync as jest.Mock).mockReturnValue(configContent);

            const result = await Utils.pollAndValidateConfigFile(filename, expectedVersion, 1000, 100);

            expect(result).toBe(expectedPath);
            expect(mockFs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf-8');
        });

        it('should find and validate schema file with correct version', async () => {
            const filename = 'zowe.schema.json';
            const expectedVersion = 3;
            const schemaFile = 'zowe.schema.json';
            const expectedPath = `${mockDownloadsFolder}\\${schemaFile}`;
            const schemaContent = JSON.stringify({ 'vscode-internal-version': 3 });

            (mockFs.readdirSync as jest.Mock).mockReturnValue([schemaFile, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });
            (mockFs.readFileSync as jest.Mock).mockReturnValue(schemaContent);

            const result = await Utils.pollAndValidateConfigFile(filename, expectedVersion, 1000, 100);

            expect(result).toBe(expectedPath);
        });

        it('should skip files with incorrect version and find correct one', async () => {
            const filename = 'zowe.config.json';
            const expectedVersion = 5;
            const oldFile = 'zowe.config.json';
            const newFile = 'zowe.config (1).json';
            const oldPath = `${mockDownloadsFolder}\\${oldFile}`;
            const newPath = `${mockDownloadsFolder}\\${newFile}`;
            
            const oldTime = Date.now() - 10000;
            const newTime = Date.now();
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue([oldFile, newFile, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes(oldFile)) return { mtimeMs: oldTime };
                if (filePath.includes(newFile)) return { mtimeMs: newTime };
                return { mtimeMs: 0 };
            });
            
            (mockFs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath === newPath) return JSON.stringify({ 'vscode-internal-version': 5 });
                if (filePath === oldPath) return JSON.stringify({ 'vscode-internal-version': 3 });
                return '{}';
            });

            const result = await Utils.pollAndValidateConfigFile(filename, expectedVersion, 1000, 100);

            expect(result).toBe(newPath);
        });

        it('should return undefined when no files have correct version', async () => {
            const filename = 'zowe.config.json';
            const expectedVersion = 5;
            const configFile = 'zowe.config.json';
            const configContent = JSON.stringify({ 'vscode-internal-version': 3 }); // Wrong version

            (mockFs.readdirSync as jest.Mock).mockReturnValue([configFile, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });
            (mockFs.readFileSync as jest.Mock).mockReturnValue(configContent);

            const result = await Utils.pollAndValidateConfigFile(filename, expectedVersion, 100, 50);

            expect(result).toBeUndefined();
        });

        it('should skip files that cannot be parsed as JSON', async () => {
            const filename = 'zowe.config.json';
            const expectedVersion = 5;
            const badFile = 'zowe.config.json';
            const goodFile = 'zowe.config (1).json';
            const badPath = `${mockDownloadsFolder}\\${badFile}`;
            const goodPath = `${mockDownloadsFolder}\\${goodFile}`;
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue([badFile, goodFile, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });
            (mockFs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath === badPath) return 'invalid json';
                if (filePath === goodPath) return JSON.stringify({ 'vscode-internal-version': 5 });
                return '{}';
            });

            const result = await Utils.pollAndValidateConfigFile(filename, expectedVersion, 1000, 100);

            expect(result).toBe(goodPath);
        });

        it('should handle file read errors gracefully', async () => {
            const filename = 'zowe.config.json';
            const expectedVersion = 5;
            const configFile = 'zowe.config.json';
            
            (mockFs.readdirSync as jest.Mock).mockReturnValue([configFile, 'other-file.txt']);
            (mockFs.statSync as jest.Mock).mockReturnValue({ mtimeMs: Date.now() });
            (mockFs.readFileSync as jest.Mock).mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const result = await Utils.pollAndValidateConfigFile(filename, expectedVersion, 100, 50);

            expect(result).toBeUndefined();
        });
    });

    describe('moveFile', () => {
        beforeEach(() => {
            (mockPath.dirname as jest.Mock).mockImplementation((filePath: string) => {
                const parts = filePath.split('\\');
                return parts.slice(0, -1).join('\\');
            });
        });

        it('should move file successfully when destination directory exists', () => {
            const sourcePath = 'C:\\Users\\test\\Downloads\\test.json';
            const destinationPath = 'C:\\Users\\test\\.zowe\\test.json';
            
            (mockFs.existsSync as jest.Mock).mockReturnValue(true);
            (mockFs.copyFileSync as jest.Mock).mockImplementation(() => {});
            (mockFs.unlinkSync as jest.Mock).mockImplementation(() => {});

            Utils.moveFile(sourcePath, destinationPath);

            expect(mockFs.copyFileSync).toHaveBeenCalledWith(sourcePath, destinationPath);
            expect(mockFs.unlinkSync).toHaveBeenCalledWith(sourcePath);
        });

        it('should create destination directory if it does not exist', () => {
            const sourcePath = 'C:\\Users\\test\\Downloads\\test.json';
            const destinationPath = 'C:\\Users\\test\\.zowe\\test.json';
            const destinationDir = 'C:\\Users\\test\\.zowe';
            
            (mockFs.existsSync as jest.Mock).mockReturnValue(false);
            (mockFs.mkdirSync as jest.Mock).mockImplementation(() => {});
            (mockFs.copyFileSync as jest.Mock).mockImplementation(() => {});
            (mockFs.unlinkSync as jest.Mock).mockImplementation(() => {});

            Utils.moveFile(sourcePath, destinationPath);

            expect(mockFs.mkdirSync).toHaveBeenCalledWith(destinationDir, { recursive: true });
            expect(mockFs.copyFileSync).toHaveBeenCalledWith(sourcePath, destinationPath);
            expect(mockFs.unlinkSync).toHaveBeenCalledWith(sourcePath);
        });

        it('should propagate errors from copy operation', () => {
            const sourcePath = 'C:\\Users\\test\\Downloads\\test.json';
            const destinationPath = 'C:\\Users\\test\\.zowe\\test.json';
            
            (mockFs.existsSync as jest.Mock).mockReturnValue(true);
            (mockFs.copyFileSync as jest.Mock).mockImplementation(() => {
                throw new Error('Copy failed');
            });

            expect(() => Utils.moveFile(sourcePath, destinationPath)).toThrow('Copy failed');
        });

        it('should propagate errors from unlink operation', () => {
            const sourcePath = 'C:\\Users\\test\\Downloads\\test.json';
            const destinationPath = 'C:\\Users\\test\\.zowe\\test.json';
            
            (mockFs.existsSync as jest.Mock).mockReturnValue(true);
            (mockFs.copyFileSync as jest.Mock).mockImplementation(() => {});
            (mockFs.unlinkSync as jest.Mock).mockImplementation(() => {
                throw new Error('Delete failed');
            });

            expect(() => Utils.moveFile(sourcePath, destinationPath)).toThrow('Delete failed');
        });
    });
});
