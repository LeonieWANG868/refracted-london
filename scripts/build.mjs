import {copyFile, mkdir, readdir} from 'node:fs/promises';
const root = new URL('../', import.meta.url);

const files = ['index.html','styles.css','mark.svg','data/journeys.json','data/london-district.json','data/landmarks.json','vendor/three.module.js','vendor/three.core.js','vendor/LICENSE'];
for (const name of await readdir(new URL('src/',root))) {
  if (name.endsWith('.js')) files.push('src/'+name);
}
for (const file of files) {
  const destination = new URL('dist/'+file,root);
  await mkdir(new URL('.',destination),{recursive:true});
  await copyFile(new URL(file,root),destination);
}
console.log('Deployable static build created in dist/.');
