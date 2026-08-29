const fs = require('fs');
let content = fs.readFileSync('src/pages/Fees.tsx', 'utf8');

// We want to replace matching f.academicYear === SOME_VAR with normalizeYear(f.academicYear) === normalizeYear(SOME_VAR)
// Specifically:
// f.academicYear === year
// f.academicYear === payload.academicYear
// f.academicYear === targetYear
// f.academicYear === filterAcademicYear
// f.academicYear === defaultComp.academicYear
// f.academicYear === comp.academicYear
// f.academicYear === selectedPaymentYear

const toReplace = [
  "year",
  "payload.academicYear",
  "targetYear",
  "filterAcademicYear",
  "defaultComp.academicYear",
  "comp.academicYear",
  "selectedPaymentYear"
];

for (const v of toReplace) {
  content = content.split(`f.academicYear === ${v}`).join(`normalizeYear(f.academicYear) === normalizeYear(${v})`);
}

fs.writeFileSync('src/pages/Fees.tsx', content);
console.log("Done");
