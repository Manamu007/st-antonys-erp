import { execSync } from 'child_process';

const run = (cmd: string) => {
  try {
    console.log(`=== RUNNING: ${cmd} ===`);
    console.log(execSync(cmd, { encoding: 'utf8' }));
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
  }
};

run('git status');
run('git reflog');
run('git log -n 5');
run('git diff src/pages/Students.tsx');
