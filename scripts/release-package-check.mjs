#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'),'utf8'));
const checks=[];
const check=(name,ok,detail='')=>checks.push({name,ok,detail});
const exists=(p)=>fs.existsSync(path.join(root,p));
const inGitWorktree=()=>{
  try {
    return execFileSync('git',['rev-parse','--is-inside-work-tree'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()==='true';
  } catch {
    return false;
  }
};
const generatedTreeSafe=(target)=>{
  if (!exists(target)) return true;
  if (!inGitWorktree()) return false;
  try {
    execFileSync('git',['check-ignore','-q','--',target],{stdio:'ignore'});
    return true;
  } catch {
    return false;
  }
};

check('package version', pkg.version === '2.4.16', String(pkg.version));
check('lock version', JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8')).version === pkg.version);
check('no .env in release tree', !exists('.env'));
check('node_modules excluded from release/Git tracking', generatedTreeSafe('node_modules'), exists('node_modules') ? 'present locally but ignored by Git' : 'absent from release tree');
check('dist excluded from release/Git tracking', generatedTreeSafe('dist'), exists('dist') ? 'present locally but ignored by Git' : 'absent from release tree');
check('no macOS archive metadata', !exists('__MACOSX'));
check('only one active roadmap', exists('docs/roadmap/ROADMAP-v2.5-PUBLIC-CERTIFICATION.md') && fs.readdirSync(path.join(root,'docs/roadmap')).filter(f=>f.endsWith('.md')).length===1);
check('no root historical roadmap files', fs.readdirSync(root).filter(f=>/^ROADMAP.*\.md$/i.test(f)).length===0);
check('blueprint archived', exists('docs/archive/legacy/GAIN_NIAGA_KOIN_GO_PUBLIC_BLUEPRINT.txt'));
check('dockerfile has no stale documentation copies', !fs.readFileSync(path.join(root,'Dockerfile'),'utf8').includes('DATABASE_FINAL_AUDIT.md'));
check('docker compose has no fixed container names', !fs.readFileSync(path.join(root,'docker-compose.yml'),'utf8').includes('container_name:'));
check('env example present', exists('.env.example'));
const failed=checks.filter(c=>!c.ok);
console.log(JSON.stringify({ok:failed.length===0,failedCount:failed.length,checks},null,2));
process.exitCode=failed.length?1:0;
