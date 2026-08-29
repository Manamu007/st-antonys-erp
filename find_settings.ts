import * as fs from 'fs';
import * as path from 'path';

function searchFile(dir: string, fileNamePattern: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchFile(fullPath, fileNamePattern);
    } else if (file.toLowerCase().includes(fileNamePattern.toLowerCase())) {
      console.log('Found:', fullPath);
    }
  }
}

searchFile('src', 'settings');
