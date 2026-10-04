#!/usr/bin/env node
import fs from 'node:fs';
for (const p of ['dist','coverage']) if (fs.existsSync(p)) fs.rmSync(p,{recursive:true,force:true});
console.log(JSON.stringify({ok:true,removed:['dist','coverage'].filter(p=>!fs.existsSync(p))},null,2));
