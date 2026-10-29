import fs from 'node:fs';
import {spawn} from 'node:child_process';
fs.mkdirSync('.cache',{recursive:true});
const lock='.cache/information-worker.pid';
try{const pid=Number(fs.readFileSync(lock,'utf8'));process.kill(pid,0);console.log('정보 자동 처리기가 이미 실행 중입니다.');process.exit(0);}catch{/* stale or no pid */}
fs.writeFileSync(lock,String(process.pid),{flag:'w'});
let child;let stopped=false;let timer;
const heartbeat=()=>fs.writeFileSync('.cache/information-worker.json',JSON.stringify({pid:process.pid,at:new Date().toISOString(),state:child?'processing':'waiting'}));
const heart=setInterval(heartbeat,15000);
function run(){
 if(stopped)return;
 child=spawn(process.execPath,['--env-file-if-exists=.env.local','scripts/sync-api-first.mjs'],{stdio:'inherit'});heartbeat();
 child.on('error',e=>console.error(e.message));
 child.on('close',()=>{child=undefined;heartbeat();if(!stopped)timer=setTimeout(run,21600000);});
}
function stop(){stopped=true;clearTimeout(timer);clearInterval(heart);child?.kill('SIGTERM');fs.rmSync(lock,{force:true});fs.rmSync('.cache/information-worker.json',{force:true});process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
console.log('코드 기반 수집 시작: 공공 API → 공식 첨부 → 주택목록 주소, 6시간 간격');run();
