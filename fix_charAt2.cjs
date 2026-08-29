const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('./src');
let modifiedFiles = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content;

  // e.g. student.name?.charAt(0) -> (student.name || "").charAt(0)
  newContent = newContent.replace(/([a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*)\?\.charAt\(([0-9]+)\)/g, '(String($1 || "")).charAt($3)');
  newContent = newContent.replace(/([a-zA-Z0-9_]+)\?\.\s*([a-zA-Z0-9_]+)\?\.\s*charAt\(([0-9]+)\)/g, '(String($1?.$2 || "")).charAt($3)');

  newContent = newContent.replace(/\(e\.parentName \|\| e\.email\)\?\.charAt\(([0-9]+)\)/g, '(String(e.parentName || e.email || "")).charAt($1)');
  newContent = newContent.replace(/\(selectedEnquiry\.parentName \|\| selectedEnquiry\.email\)\.charAt\(([0-9]+)\)/g, '(String(selectedEnquiry.parentName || selectedEnquiry.email || "")).charAt($1)');


  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    modifiedFiles++;
    console.log(`Updated ${file}`);
  }
}

console.log(`Fixed ${modifiedFiles} files.`);
