import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'source/expansion-imports.json');
const jobs=JSON.parse(await fs.readFile(file,'utf8'));
for(const job of jobs){
 const theme=job.id.split('-')[0],relative=`masters/${theme}/${job.category}/${job.id}.png`,dest=path.join(root,relative);
 const source=path.isAbsolute(job.source)?job.source:path.join(root,job.source);
 await fs.mkdir(path.dirname(dest),{recursive:true});if(path.resolve(source)!==path.resolve(dest))await fs.copyFile(source,dest);
 job.source=relative;
 job.references=job.references?.map(p=>p.replaceAll('\\','/').replace(root.replaceAll('\\','/')+'/',''));
 delete job.originalSource;
}
await fs.writeFile(file,JSON.stringify(jobs,null,2)+'\n');
await fs.writeFile(path.join(root,'source/expansion-prompts.json'),JSON.stringify(jobs.map(({id,prompt,references,repairPrompt})=>({id,prompt,references,repairPrompt})),null,2)+'\n');
console.log(`Preserved ${jobs.length} generated PNG masters and their prompts.`);
