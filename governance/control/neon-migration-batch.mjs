import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const scope=[
 ['001_founder_state.sql','99ed96e0dee73dffdb75460ab8fc9a496f336de3c1b7756e411be84912ab507d'],
 ['002_execution_journal.sql','4e9cd5e6ab9dd321ca81313edf2ff69e106673a84e73534ca88c4bdbae2d24bd'],
 ['003_control_permissions.sql','c9e7b7b965405564f863fc2d0a58b158e630ea6208e56b47653c92fc5256fda2'],
];
// Builds the precise review scope as one atomic transaction; does NOT connect,
// apply SQL, provision LOGIN credentials or initialize a founder policy.
export async function prepareNeonMigrationBatch(){
 const scripts=[];
 for(const [name,expected] of scope){
  const bytes=await readFile(new URL(`../migrations/${name}`,import.meta.url));
  let sql=bytes.toString('utf8').replace(/\r\n/g,'\n');
  if(createHash('sha256').update(sql).digest('hex')!==expected)throw new Error('Migration differs from reviewed approval scope (UTF-8/LF).');
  if((sql.match(/^begin;$/gm)||[]).length!==1||(sql.match(/^commit;$/gm)||[]).length!==1||!sql.trimEnd().endsWith('commit;'))throw new Error('Unreviewed migration transaction shape.');
  sql=sql.replace(/^begin;\n/m,'').replace(/^commit;\s*$/m,'');scripts.push(`-- Reviewed migration ${name}\n${sql}`);
 }
 return {manifest:scope.map(([name,sha256])=>({name,sha256})),sql:`BEGIN;\n${scripts.join('\n')}\nCOMMIT;\n`};
}
