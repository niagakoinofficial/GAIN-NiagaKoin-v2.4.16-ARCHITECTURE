#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

if (fs.existsSync('node_modules')) fs.rmSync('node_modules',{recursive:true,force:true});
if (fs.existsSync('dist')) fs.rmSync('dist',{recursive:true,force:true});
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm,['ci','--no-audit','--no-fund'],{stdio:'inherit'});
process.exitCode = result.status ?? 1;
