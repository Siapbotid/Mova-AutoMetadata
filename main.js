const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { machineIdSync } = require('node-machine-id');
const fetch = require('node-fetch');
const { validateEmailLicense } = require('./api/license-handler');

// Fix for electron-store v10+ - use dynamic import or downgrade
let Store;
let store;

// Initialize store asynchronously
async function initializeStore() {
  try {
    // For electron-store v10+, we need to use dynamic import
    const { default: ElectronStore } = await import('electron-store');
    Store = ElectronStore;
    store = new Store();
  } catch (error) {
    console.error('Failed to initialize electron-store:', error);
    // Fallback to simple file-based storage
    const os = require('os');
    const configPath = path.join(os.homedir(), '.autometadata-config.json');
    store = {
      get: (key, defaultValue) => {
        try {
          if (fs.existsSync(configPath)) {
            const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return data[key] !== undefined ? data[key] : defaultValue;
          }
          return defaultValue;
        } catch {
          return defaultValue;
        }
      },
      set: (key, value) => {
        try {
          let data = {};
          if (fs.existsSync(configPath)) {
            data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          }
          data[key] = value;
          fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
        } catch (error) {
          console.error('Failed to save config:', error);
        }
      }
    };
  }
}

let mainWindow;

function createWindow() {
  // Read version from package.json
  const packageJson = require('./package.json');
  const appVersion = packageJson.version;
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true, // Hide menu bar
    backgroundColor: '#f5f5f5', // Add this line to match your app's background color
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    title: `AutoMeta v${appVersion}`
  });

  // Create application menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Select Files',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow.webContents.send('menu-select-files');
          }
        },
        {
          label: 'Select Folder',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            mainWindow.webContents.send('menu-select-folder');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.webContents.reload();
          }
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            mainWindow.webContents.reloadIgnoringCache();
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'F12',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        },
        { type: 'separator' },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            mainWindow.webContents.setZoomLevel(0);
          }
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomLevel();
            mainWindow.webContents.setZoomLevel(currentZoom + 1);
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomLevel();
            mainWindow.webContents.setZoomLevel(currentZoom - 1);
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Fullscreen',
          accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11',
          click: () => {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          click: () => {
            mainWindow.minimize();
          }
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            mainWindow.close();
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About AutoMeta',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About AutoMeta',
              message: `AutoMeta v${appVersion}`,
              detail: 'Ultimate AI-Powered Metadata Generator\nMicrostock Booster 3X Edition (Unlimited)',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        {
          label: 'About ' + app.getName(),
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About AutoMeta',
              message: `AutoMeta v${appVersion}`,
              detail: 'Ultimate AI-Powered Metadata Generator\nMicrostock Booster 3X Edition (Unlimited)',
              buttons: ['OK']
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Hide ' + app.getName(),
          accelerator: 'Command+H',
          click: () => {
            app.hide();
          }
        },
        {
          label: 'Hide Others',
          accelerator: 'Command+Shift+H',
          click: () => {
            app.hideOthersExcept(mainWindow);
          }
        },
        {
          label: 'Show All',
          click: () => {
            app.unhide();
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    });

    // Window menu
    template[3].submenu = [
      {
        label: 'Close',
        accelerator: 'CmdOrCtrl+W',
        click: () => {
          mainWindow.close();
        }
      },
      {
        label: 'Minimize',
        accelerator: 'CmdOrCtrl+M',
        click: () => {
          mainWindow.minimize();
        }
      },
      {
        label: 'Zoom',
        click: () => {
          mainWindow.setFullScreen(!mainWindow.isFullScreen());
        }
      },
      { type: 'separator' },
      {
        label: 'Bring All to Front',
        click: () => {
          app.focus();
        }
      }
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  mainWindow.loadFile('login.html');
  
  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize store before creating window
app.whenReady().then(async () => {
  await initializeStore();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on('load-dashboard', () => {
    mainWindow.loadFile('index.html');
});

ipcMain.on('navigate-to-login', () => {
    mainWindow.loadFile('login.html');
});

// IPC Handlers
// IPC Handlers for API Keys
ipcMain.handle('save-api-key', async (event, apiKey, platform = 'openai') => {
  try {
    console.log('Main: Saving API key - type:', typeof apiKey, 'value:', apiKey);
    // Ensure we're storing a string, not an object
    const keyToStore = typeof apiKey === 'string' ? apiKey : String(apiKey);
    store.set(`${platform}-api-key`, keyToStore);
    console.log('Main: Stored API key:', keyToStore);
    return { success: true };
  } catch (error) {
    console.error('Main: Error saving API key:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-api-key', async (event, platform = 'openai') => {
  try {
    // Get API key with platform-specific key
    const apiKey = store.get(`${platform}-api-key`, '');
    console.log('Main: Retrieved API key - type:', typeof apiKey, 'value:', apiKey);
    
    // If it's an object (corrupted), return empty string
    const keyToReturn = typeof apiKey === 'string' ? apiKey : '';
    console.log('Main: Returning API key:', keyToReturn);
    
    return { success: true, apiKey: keyToReturn };
  } catch (error) {
    console.error('Main: Error getting API key:', error);
    return { success: false, error: error.message };
  }
});

// New handlers for multiple API keys
ipcMain.handle('save-multi-api-keys', async (event, apiKeys, platform = 'openai') => {
  try {
    // Store multiple API keys with platform-specific key
    store.set(`${platform}-multi-api-keys`, apiKeys);
    // Store the current usage method
    store.set(`${platform}-key-usage-method`, apiKeys.method);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-multi-api-keys', async (event, platform = 'openai') => {
  try {
    // Get multiple API keys with platform-specific key
    const apiKeys = store.get(`${platform}-multi-api-keys`, { keys: [], method: 'rotation' });
    return { success: true, apiKeys };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-files', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media Files', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'webm'] }
      ]
    });
    return { success: true, filePaths: result.filePaths };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0];
      const mediaFiles = getMediaFilesFromFolder(folderPath);
      return { success: true, filePaths: mediaFiles };
    }
    return { success: true, filePaths: [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function getMediaFilesFromFolder(folderPath) {
  const mediaExtensions = [
    // Image extensions
    '.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp',
    // Video extensions
    '.mp4', '.mov', '.avi', '.mkv', '.webm',
    // Vector extensions
    '.svg', '.eps', '.ai'
  ];
  const files = [];
  
  // Only scan the root directory, not subdirectories
  const items = fs.readdirSync(folderPath);
  
  // Sort items alphabetically (case-insensitive)
  items.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  
  for (const item of items) {
    const fullPath = path.join(folderPath, item);
    const stat = fs.statSync(fullPath);
    
    // Only process files, skip directories entirely
    if (stat.isFile() && mediaExtensions.includes(path.extname(item).toLowerCase())) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Add this handler to clear corrupted API keys
// Add this handler after the existing handlers
ipcMain.handle('clear-api-key', async (event, platform = 'openai') => {
  try {
    store.delete(`${platform}-api-key`);
    console.log('Main: Cleared API key for platform:', platform);
    return { success: true };
  } catch (error) {
    console.error('Main: Error clearing API key:', error);
    return { success: false, error: error.message };
  }
});

// Add the ipcMain.handle for validate-license back
ipcMain.handle('validate-license', async (event, email, webAppUrl, action = 'login') => {
  try {
    const machineId = machineIdSync({ original: true });
    const result = await validateEmailLicense(email, webAppUrl, machineId, action);
    return result;
  } catch (error) {
    console.error('Main: Error during license validation:', error);
    return { success: false, message: error.message };
  }
});