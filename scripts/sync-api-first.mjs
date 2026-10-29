import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {runStages} from './lib/api-first-runner.mjs';
const dry=process.argv.includes('--dry-run');
const stages=[
 ['public-api','공공 API 공고 수집',['scripts/sync-myhome-all.mjs']],
 ['normalize','API 공고 정규화',['scripts/normalize-lh-notices.mjs']],
 ['housing-api','공공주택 API 상세 수집',['scripts/sync-lh-api.mjs']],
 ['official-tables','LH 공식 주택형 정보',['scripts/enrich-complexes.mjs','--active']],
 ['document-tables','공고문 표 정보 보강',['scripts/extract-supply-from-md.mjs']],
 ['sh','SH 공식 공고 수집',['scripts/sync-sh.mjs']],
 ['youth','청년안심주택 공식 공고 수집',['scripts/sync-youth.mjs']],
 ['materials','공식 첨부 링크 보완',['--import','tsx','scripts/collect-notice-materials.ts','--limit','100','--links-only']],
 ['documents','변경 원본 파일 확인',['--import','tsx','scripts/download-notice-files.ts','--limit','100','--active-only']],
 ['locations','공식 주택목록 주소 수집',['--import','tsx','scripts/collect-pending-locations.ts','--limit','100']],
];
if(process.argv.includes('--data-only'))stages.splice(stages.findIndex(([id])=>id==='materials'));
await fs.mkdir('.cache',{recursive:true});
if(dry){console.log(JSON.stringify({mode:'dry-run',stages:stages.map(([id,label])=>({id,label}))},null,2));process.exit(0);}
if(!process.env.DATA_GO_KR_KEY)throw Error('DATA_GO_KR_KEY 미설정: API 수집을 시작할 수 없습니다.');
const lock='.cache/api-first.lock';let handle;
try { const pid=Number(await fs.readFile(lock,'utf8')); if(!Number.isInteger(pid)||pid<=0)throw Error('수집 잠금 파일 PID 확인 필요'); try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')await fs.unlink(lock);else throw e;} } catch(e){if(e.code!=='ENOENT')throw e;}

try{handle=await fs.open(lock,'wx');await handle.writeFile(String(process.pid));}catch{throw Error('API 우선 수집이 이미 실행 중입니다. .cache/api-first.lock 실행 PID를 확인해 주세요.');}
const state={startedAt:new Date().toISOString(),finishedAt:null,status:'running',stage:'',stages:[]};
const save=async()=>{await fs.writeFile('.cache/api-first-status.json.tmp',JSON.stringify(state,null,2));await fs.rename('.cache/api-first-status.json.tmp','.cache/api-first-status.json');};
let child;let stopping=false;
const stop=()=>{stopping=true;child?.kill('SIGTERM');};process.on('SIGTERM',stop);process.on('SIGINT',stop);
try{
 await runStages(stages,async args=>{
  if(stopping)throw Error("수집 중단 요청");
  const code=await new Promise((resolve,reject)=>{child=spawn(process.execPath,args,{stdio:'inherit',env:{...process.env,API_FIRST:'1'}});child.on('error',reject);child.on('close',resolve);});child=undefined;return code;
 },async(label,results)=>{state.stage=label;state.stages=results;await save();});
 state.status='completed';
}catch(e){state.status='failed';state.error=e.message;process.exitCode=1;console.error(e.message);}
finally{state.finishedAt=new Date().toISOString();await save();await handle.close();await fs.unlink(lock);}
