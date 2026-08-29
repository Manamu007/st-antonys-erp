const fs = require('fs');
console.log(fs.readFileSync('src/pages/Hostel.tsx', 'utf8').substring(6000, 11000));
