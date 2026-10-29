import {spawn} from 'node:child_process';
const worker=spawn(process.execPath,['scripts/watch-information.mjs'],{stdio:'inherit'});
const web=spawn(process.execPath,['node_modules/next/dist/bin/next','dev',...process.argv.slice(2)],{stdio:'inherit'});
function stop(){worker.kill('SIGTERM');web.kill('SIGTERM');}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
web.on('exit',code=>{worker.kill('SIGTERM');process.exitCode=code??0;});
