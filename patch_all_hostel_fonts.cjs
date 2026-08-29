const fs = require('fs');

let content = fs.readFileSync('src/pages/Hostel.tsx', 'utf8');

// Increase text sizes globally within Hostel.tsx where appropriate
content = content.replace(/text-sm\b/g, 'text-base');
content = content.replace(/text-xs\b/g, 'text-sm');

// Also make some headings larger
content = content.replace(/text-3xl\b/g, 'text-4xl');
content = content.replace(/text-xl\b/g, 'text-2xl');

fs.writeFileSync('src/pages/Hostel.tsx', content);
