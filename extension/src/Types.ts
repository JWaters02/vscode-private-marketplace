export type ExtensionEntry = {
    name: string;
    packageName: string;
    category?: string;
};

export type GeneratedExtensionEntry = ExtensionEntry & {
    version?: string;
    downloadURL: string;
};

export type ExtensionJson = {
    approvedExtensionsPath: string;
    approvedExtensions: ExtensionEntry[];
    extraWhitelist?: string[];
    allowAllVersions?: string[];
    zoweConfigVersion?: number;
    zoweSchemaVersion?: number;
};

export type ConfigVersions = {
    zoweConfig: number;
    zoweSchema: number;
}