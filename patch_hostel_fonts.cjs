const fs = require('fs');

let content = fs.readFileSync('src/pages/Hostel.tsx', 'utf8');

content = content.replace('table className="w-full text-left font-mono text-base text-neutral-600"', 'table className="w-full text-left font-mono text-lg text-neutral-600"');
content = content.replace('thead className="bg-neutral-50 font-bold border-b border-neutral-100 uppercase tracking-widest text-sm"', 'thead className="bg-neutral-50 font-bold border-b border-neutral-100 uppercase tracking-widest text-base"');
content = content.replace('<span className="font-bold text-neutral-900 text-lg">{student.name}</span>', '<span className="font-bold text-neutral-900 text-xl">{student.name}</span>');
content = content.replace('<div className="flex gap-2 items-center text-sm text-neutral-500 mt-1">', '<div className="flex gap-2 items-center text-base text-neutral-500 mt-1">');
content = content.replace('<span className="text-neutral-500 text-sm ml-1">{batch}</span>', '<span className="text-neutral-500 text-base ml-1">{batch}</span>');
content = content.replace('<div className="text-sm">\n                                Room:', '<div className="text-base">\n                                Room:');
content = content.replace('<span className="text-sm text-neutral-500 flex items-center gap-1 mt-1"><Phone className="w-4 h-4" />', '<span className="text-base text-neutral-500 flex items-center gap-1 mt-1"><Phone className="w-5 h-5" />');
content = content.replace('className="px-3 py-1.5 text-sm font-bold bg-neutral-100 text-neutral-600 hover:bg-primary hover:text-white rounded-lg transition-colors"', 'className="px-4 py-2 text-base font-bold bg-neutral-100 text-neutral-600 hover:bg-primary hover:text-white rounded-lg transition-colors"');

fs.writeFileSync('src/pages/Hostel.tsx', content);
