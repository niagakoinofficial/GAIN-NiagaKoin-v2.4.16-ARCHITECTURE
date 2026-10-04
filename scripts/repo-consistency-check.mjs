#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const checks=[];
const check=(name,ok,detail='')=>checks.push({name,ok,detail});

check('package version', pkg.version === '2.4.16', `package=${pkg.version}`);
check('lock version', lock.version === pkg.version && lock.packages?.['']?.version === pkg.version, `lock=${lock.version}`);
check('package name', lock.name === pkg.name && lock.packages?.['']?.name === pkg.name, `name=${pkg.name}`);
check('lockfile v3', lock.lockfileVersion === 3, `lockfileVersion=${lock.lockfileVersion}`);
check('engines declared', pkg.engines?.node?.includes('22') && pkg.engines?.npm?.includes('10'), JSON.stringify(pkg.engines));
check('package manager declared', pkg.packageManager === 'npm@10.9.2', String(pkg.packageManager));
const lockRoot = lock.packages?.[''] || {};
for (const section of ['dependencies','devDependencies']) {
  const expected = pkg[section] || {};
  const actual = lockRoot[section] || {};
  const names = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  check(`${section} specs match lock`, [...names].every((name) => expected[name] === actual[name]), `${section} lock/package manifest drift`);
}
check('current html version', read('index.html').includes(`GAIN-Niaga-Koin-v${pkg.version}`));
check('metadata version', JSON.parse(read('metadata.json')).name === 'GAIN-Niaga-Koin-v2.4.16');
check('active roadmap is singular', fs.existsSync(path.join(root,'docs/roadmap/ROADMAP-v2.5-PUBLIC-CERTIFICATION.md')) && fs.readdirSync(path.join(root,'docs/roadmap')).filter(f => /^ROADMAP.*\.md$/i.test(f)).length === 1);
check('no root roadmap docs', fs.readdirSync(root).filter(f => /^ROADMAP.*\.md$/i.test(f)).length === 0);
check('env template exists', exists('.env.example'))
check('dockerfile references exist', !read('Dockerfile').includes('ARCHITECTURE_FINAL.md') && !read('Dockerfile').includes('DATABASE_FINAL_AUDIT.md') && !read('Dockerfile').includes('MIGRATION_RUNBOOK_FINAL.md'));
check('compose has no fixed container names', !read('docker-compose.yml').includes('container_name:'));
check('npm ci is used in docker build', read('Dockerfile').includes('npm ci'));
check('canonical version metadata aligned', JSON.parse(read('metadata.json')).name === `GAIN-Niaga-Koin-v${pkg.version}`);
const failed=checks.filter(x=>!x.ok);
console.log(JSON.stringify({ok:failed.length===0,failedCount:failed.length,checks},null,2));
process.exitCode=failed.length?1:0;
