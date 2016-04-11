var electron = require('electron-prebuilt');
var proc = require('child_process');

console.log(electron);

child = proc.spawn(electron, ['.']);
