'use strict';

const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const Menu = electron.Menu;
const MenuItem = electron.MenuItem;

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const request = require('request');
const progress = require('request-progress');
const tar = require('tar-fs');
const rimraf = require('rimraf');

var config = require('./config');

var menuTmpl = [{
  label: '编辑',
  submenu: [
    {
      label: '撤销',
      accelerator: 'CmdOrCtrl+Z',
      role: 'undo'
    },
    {
      label: '恢复',
      accelerator: 'Shift+CmdOrCtrl+Z',
      role: 'redo'
    },
    {
      type: 'separator'
    },
    {
      label: '复制',
      accelerator: 'CmdOrCtrl+C',
      role: 'copy'
    },
    {
      label: '剪切',
      accelerator: 'CmdOrCtrl+X',
      role: 'cut'
    },
    {
      label: '粘贴',
      accelerator: 'CmdOrCtrl+V',
      role: 'paste'
    },
    {
      label: '全选',
      accelerator: 'CmdOrCtrl+A',
      role: 'selectall'
    },
  ]
}, {
  label: '浏览',
  submenu: [
    {
      label: '刷新',
      click: function() {
        mainWindow.reload();
      },
      accelerator: "CmdOrCtrl+R"
    },
    {
      label: '切换全屏模式',
      accelerator: (function() {
        if (process.platform == 'darwin')
          return 'Ctrl+Command+F';
        else
          return 'F11';
      })(),
      click: function(item, focusedWindow) {
        if (focusedWindow)
          focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
      }
    },
    {
      type: 'separator'
    },
    {
      label: '使用在线版本',
      click: function() {
        useWeb();
      }
    },
    {
      label: '使用本地缓存 (测试中)',
      click: function() {
        useLocal();
      }
    },
    {
      type: 'separator'
    },
    {
      label: '打开引擎盖',
      click: function() {
        mainWindow.webContents.openDevTools();
      }
    },
  ]
}, {
  label: '帮助',
  submenu: [
  ]
}];

if(process.platform == 'darwin') {
  var name = app.getName();
  console.log(name);
  menuTmpl.unshift({
    label: name,
    submenu: [
      {
        label: '关于 ' + name,
        role: 'about'
      },
      {
        type: 'separator'
      },
      {
        label: '服务',
        role: 'services',
        submenu: []
      },
      {
        type: 'separator'
      },
      {
        label: '隐藏 ' + name,
        accelerator: 'Command+H',
        role: 'hide'
      },
      {
        label: '隐藏其他窗口',
        accelerator: 'Command+Alt+H',
        role: 'hideothers'
      },
      {
        label: '显示所有窗口',
        role: 'unhide'
      },
      {
        type: 'separator'
      },
      {
        label: '退出',
        accelerator: 'Command+Q',
        click: function() { app.quit(); }
      },
    ]
  });
}

var mainWindow = null;

console.log("[CB] Booting...");
console.log("[CB] Data Path:", app.getPath('userData'));

function getDescriptor() {
  console.log("[CB] Getting descriptor...");
  return new Promise(function(resolve, reject) {
    request.get({
      url: 'https://api.github.com/repos/CircuitCoder/ConsoleiT-Frontend/releases/latest',
      headers: {
        'User-Agent': 'request'
      },
      json: true
    }, function(err, resp, body) {
      //TODO: Handle Error
      if(err) console.log(err);
      else if(resp.statusCode != 200) console.log(resp);
      else resolve(body);
    });
  });
}

function checkVersion(descriptor) {
  try {
    var file = fs.readFileSync(path.normalize(__dirname + '/version.json'))
    var config = JSON.parse(file);
    if(config.version != descriptor.tag_name) return true;
    else return false;
  } catch(e) {
    if(e.code == "ENOENT") return true;
    else {
      console.log(e);
      throw e;
    }
  }
}

function logVersion(descriptor) {
  fs.writeFileSync(path.normalize(__dirname + '/version.json'), JSON.stringify({
    version: descriptor.tag_name
  }));
}

function downloadLatest(descriptor) {
  return new Promise(function(resolve, reject) {
    console.log("[CB] Downloading...");
    var target = descriptor.assets.filter((e) => e.name == "webpack.tar.gz");
    if(target.length == 0) return resolve();
    console.log(target);

    rimraf.sync(path.normalize(__dirname + '/dist'));
    
    progress(request.get({
      url: target[0].browser_download_url,
      timeout: 20000
    }), {
      throttle: 1000,
    })
    .on('progress', function(state) {
      console.log('progress', state);
    })
    .pipe(zlib.createGunzip())
    .pipe(tar.extract(__dirname))
    .on('finish', function() {
      rimraf.sync(path.normalize(__dirname + '/webpack.tar.gz'));
      resolve();
    }).on('error', function(err) {
      console.log(err);
      reject(err);
    });
  });
}

var checked = false;

function checkForUpdate() {
  if(checked) return Promise.resolve();
  else return new Promise(function(resolve, reject) {
    getDescriptor().then(function(desc) {
      console.log(checkVersion(desc));
      if(checkVersion(desc))
        downloadLatest(desc).then(function() {
          logVersion(desc);
          checked = true;
          return resolve();
        });
      else {
        checked = true;
        return resolve();
      }
    });
  });
}

app.on('window-all-closed', function() {
  if(process.platform != 'darwin') {
    app.quit();
  }
});

function useLocal() {
  config.defaultMode = "local";
  mainWindow.loadURL(path.normalize('file://' + __dirname + '/index.html'));

  checkForUpdate().then(function() {
    console.log("[CB] Update finished.");

    var protocol = electron.protocol;
    protocol.interceptHttpProtocol('http', function(req, cb) {
      if(req.url.indexOf(config.local) == 0) {
        console.log('[CB] Loading:', req.url.substring(config.local.length));
        req.url = 'file://' + __dirname + '/dist' + req.url.substring(config.local.length);
        cb(req);
      } else {
        return null;
      }
    }, function(err) {
      if(err) console.error(err);
      else console.log("[CB] Protocol intercepted");
    });

    mainWindow.loadURL(config.local + '/index.html');
  });
}

function useWeb() {
  config.defaultMode = "web";
  var protocol = electron.protocol;
  protocol.uninterceptProtocol('http');
  mainWindow.loadURL(config.frontend + '/index.html');
}

app.on('ready', function() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800
  });

  mainWindow.on('closed', function() {
    mainWindow = null;
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTmpl));

  if(config.defaultMode == "web") useWeb();
  else if(config.defaultMode == "local") useLocal();
});

app.on('quit', function() {
  fs.writeFileSync(__dirname + '/config.json', JSON.stringify(config));
});
