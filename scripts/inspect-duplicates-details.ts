import * as fs from 'fs';

const list: any[] = JSON.parse(fs.readFileSync('./class1_deep_inspection.json', 'utf8'));

const ids = [
  // IPL duplicates
  'pravalika_d_91628211', 'stud_1779530163388',
  'rama_shanvika_g_9183111', 'sree_shanvitha_s_91949311',
  'guru_ayushirishika_a_91630311', 'jyothirmayi_c_91944211', 'surendra_j_91950211',
  // S-Batch duplicates
  'guru_jaya_vardhan_b_91958211', 'rithik_d_9199611',
  'guru_teja_swaroop_reddy_p_91832811', 'suhash_g_91996711',
  'krishna_teja_reddy_g_91799411', 'varshith_m_91799311',
  'chanvipujya_sritha_c_91897911', 'meharoze_sk_91630211',
  'faria_arush_p_91889811', 'naga_thanusree_b_91973211'
];

ids.forEach(id => {
  const s = list.find(x => x.id === id);
  if (s) {
    console.log(`[${s.id}] Name: ${s.name} | Roll: ${s.rollNumber} | Gender: ${s.gender} | Father: ${s.fatherName} | Mother: ${s.motherName} | Phone: ${s.phone || s.mobileNumber} | Admission: ${s.admissionNumber || s.admissionNo}`);
  }
});
