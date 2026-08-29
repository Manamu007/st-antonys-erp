import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('./detailed_staff_summary.json', 'utf8'));

console.log('=== CHECKING SPECIFIC TEACHERS ===');

// Check p2Vp79bOrHMNOveOApuDSwtGoRH2 (Bala Guravaiah / Balaiah)
const bala = data.staff.find((s: any) => s.id === 'p2Vp79bOrHMNOveOApuDSwtGoRH2' || s.name?.toLowerCase().includes('bala'));
console.log('Bala Staff Doc:', JSON.stringify(bala, null, 2));

// Check Anil Babu doc in staff
const anilStaff = data.staff.filter((s: any) => 
  s.id?.includes('anil') || 
  s.name?.toLowerCase().includes('anil') || 
  s.phone?.includes('8074572283') || 
  s.phone?.includes('6301545697')
);
console.log('Anil Staff Docs:', JSON.stringify(anilStaff, null, 2));

// Check any blank or empty name staff in data.staff
const emptyNameStaff = data.staff.filter((s: any) => !s.name || s.name.trim() === '');
console.log(`Staff with empty name count: ${emptyNameStaff.length}`);
emptyNameStaff.forEach((s: any) => {
  console.log(`EMPTY_NAME_STAFF: ID="${s.id}" Email="${s.email}" Phone="${s.phone || s.whatsappNumber}" Role="${s.role}"`);
});

// Let's search ALL users in users collection for Anil, Bala, and Nageswar
