export class Constants {
    public static readonly AZURE_BRANCH_TEST = "test";
    public static readonly AZURE_BRANCH_MAIN = "main";
    public static readonly AZURE_REPO_BASE = "https://dev.azure.com/ADO-Project/22844d09-29df-3a0d-bff7-39ad061d525a/_apis/git/repositories/22844d09-29df-3a0d-bff7-39ad061d525a";
    public static readonly AZURE_URL_FLUFF = "&versionDescriptor%5BversionOptions%5D=0&versionDescriptor%5BversionType%5D=0&versionDescriptor%5Bversion%5D=";
    public static readonly AZURE_URL_END = "&resolveLfs=true&%24format=octetStream&api-version=5.0&download=true";
    
    public static readonly ZOWE_CONFIG_JSON_FILENAME = "zowe.config.json";
    public static readonly ZOWE_SCHEMA_JSON_FILENAME = "zowe.schema.json";
    public static readonly EXTENSION_JSON_FILENAME = "extensions.json";
    
    public static readonly APPROVED_EXTENSIONS = "approvedExtensions";
    public static readonly UPDATED_EXTENSIONS = "updatedExtensions";
    
    public static readonly KNOWN_EXTENSIONS_KEY = 'vscode-private-marketplace.knownExtensions';
    public static readonly TEST_MODE_KEY = 'vscode-private-marketplace.testMode';
    public static readonly EXTENSION_WHITELIST_KEY = 'vscode-private-marketplace.whitelistedExtensions';
    public static readonly EXTRA_WHITELIST_KEY = 'vscode-private-marketplace.extraWhitelist';
    public static readonly ALLOW_ALL_KEY = 'vscode-private-marketplace.allowAllVersions';
    public static readonly OVERRIDE_DOWNLOADS_PATH_KEY = 'vscode-private-marketplace.overrideDownloadsPath';
    public static readonly CONFIG_VERSIONS_KEY = 'vscode-private-marketplace.configVersions';
}
