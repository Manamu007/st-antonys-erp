import { execSync } from 'child_process';

try {
  const status = execSync('git status', { encoding: 'utf8' });
  console.log('GIT STATUS:\n', status);
  const diff = execSync('git diff src', { encoding: 'utf8' });
  console.log('GIT DIFF:\n', diff);
} catch (e) {
  console.error('Error running git:', e);
}
