import * as fs from 'fs';

function check() {
  if (!fs.existsSync('./class1_deep_inspection.json')) {
    console.log('File not ready');
    return;
  }
  const list: any[] = JSON.parse(fs.readFileSync('./class1_deep_inspection.json', 'utf8'));

  // Look at the specific duplicate students in 1 Class IPL:
  const idsToCheck = [
    // Roll 16
    'dhruthika_b_91630211', 'sushanth_krishna_m_91630411',
    // Roll 24
    'pravalika_d_91628211', 'stud_1779530163388',
    // Roll 26
    'rama_shanvika_g_9183111', 'sree_shanvitha_s_91949311', 'venkata_lohith_m_91888611',
    // Roll 30
    'guru_ayushirishika_a_91630311', 'jyothirmayi_c_91944211', 'surendra_j_91950211',
    // Roll 36
    'meharoze_sk_91630211', 'nandhini_b_91996411',
    // Roll 38
    'naga_thanusree_b_91973211', 'nivedha_s_91939811',
    // Roll 1
    'aman_sk_91964111',
    // Roll 22
    'venkata_rithvik_m_91939911',
    // Roll 28 in M-Batch or IPL
    'rama_sanvitha_g_91814211'
  ];

  idsToCheck.forEach(id => {
    const s = list.find(x => x.id === id);
    if (s) {
      console.log(`\n--- ID: ${s.id} ---`);
      console.log(`Name: ${s.name || s.firstName}, Roll: ${s.rollNumber}, Class: "${s.class}", Batch: "${s.batch}", ClassId: "${s.classId}", BatchId: "${s.batchId}", Status: ${s.status}`);
      console.log(`Father: ${s.fatherName}, Phone: ${s.mobileNumber || s.phone}, AcademicYear: ${s.academicYear}`);
      console.log(`Fee: ${s.feeType}, Concession: ${s.concession}, Discount: ${s.discountReason}`);
    }
  });
}

check();
