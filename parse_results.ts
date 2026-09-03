import fs from 'fs';

const data = JSON.parse(fs.readFileSync('./search_results.json', 'utf8'));

console.log("All collections in database:");
console.log(data.allCollectionsList);

console.log("\n--- Payments matches: ---");
console.log(JSON.stringify(data.paymentsFound, null, 2));

console.log("\n--- Users matches summary: ---");
data.usersFound.forEach((u: any) => {
  console.log(`User ID: ${u.id}, Name: ${u.data.name || u.data.displayName}, Email: ${u.data.email}, Role: ${u.data.role}, Phone: ${u.data.phone}`);
});

console.log("\n--- Students matches summary: ---");
console.log(`Students count: ${data.studentsFound.length}`);
data.studentsFound.forEach((s: any) => {
  console.log(`Student ID: ${s.id}, Name: ${s.data.name || s.data.firstName}, Email: ${s.data.email}, UniqueId: ${s.data.uniqueStudentId}`);
});
