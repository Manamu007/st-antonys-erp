import * as fs from 'fs';

const lines = fs.readFileSync('src/pages/Students.tsx', 'utf8').split('\n');

lines.forEach((line, index) => {
  if (line.includes('normalizeYear')) {
    console.log(`${index + 1}: ${line}`);
  }
});
