export const window = {
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  registerTreeDataProvider: jest.fn(),
};

export const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn(),
    update: jest.fn(),
  })),
};

export const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn(),
};

export const env = {
  openExternal: jest.fn(),
};

export const extensions = {
  all: [],
};

export const Uri = {
  file: jest.fn(),
  parse: jest.fn(),
};

export const TreeItem = class {
  constructor(public label: string, public collapsibleState: any) {}
};

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

export const ThemeIcon = class {
  constructor(public id: string) {}
};

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

export const EventEmitter = class {
  private listeners: any[] = [];
  
  get event() {
    return (listener: any) => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
  }
  
  fire(data?: any) {
    this.listeners.forEach(listener => listener(data));
  }
};