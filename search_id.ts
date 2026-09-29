import mongoose from 'mongoose';
import fs from 'fs';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/antonyschool_erp';

async function run() {
  console.log(`Connecting to ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI, {
    dbName: 'antonyschool_erp'
  });
  console.log("Connected to MongoDB!");

  const dbModule = await import('./src/server/db.js');

  const models = [
    { name: 'Student', model: dbModule.StudentModel },
    { name: 'Staff', model: dbModule.StaffModel },
    { name: 'User', model: dbModule.UserModel },
    { name: 'Class', model: dbModule.ClassModel },
    { name: 'Batch', model: dbModule.BatchModel },
    { name: 'Subject', model: dbModule.SubjectModel },
    { name: 'Attendance', model: dbModule.AttendanceModel },
    { name: 'Fee', model: dbModule.FeeModel },
    { name: 'Payment', model: dbModule.PaymentModel },
    { name: 'Exam', model: dbModule.ExamModel },
    { name: 'ExamMark', model: dbModule.ExamMarkModel },
    { name: 'Leave', model: dbModule.LeaveModel },
    { name: 'TimetableSlot', model: dbModule.TimetableSlotModel },
    { name: 'Bus', model: dbModule.BusModel },
    { name: 'Notice', model: dbModule.NoticeModel },
    { name: 'FrontOffice', model: dbModule.FrontOfficeModel },
    { name: 'Setting', model: dbModule.SettingModel },
    { name: 'WhatsAppLog', model: dbModule.WhatsAppLogModel },
    { name: 'WhatsAppCommunity', model: dbModule.WhatsAppCommunityModel },
    { name: 'WhatsAppTemplate', model: dbModule.WhatsAppTemplateModel },
    { name: 'WhatsAppActionToken', model: dbModule.WhatsAppActionTokenModel },
    { name: 'WhatsAppBotSession', model: dbModule.WhatsAppBotSessionModel },
    { name: 'WhatsAppBotFlow', model: dbModule.WhatsAppBotFlowModel },
    { name: 'StudentHealth', model: dbModule.StudentHealthModel },
    { name: 'AuditTrail', model: dbModule.AuditTrailModel },
    { name: 'Homework', model: dbModule.HomeworkModel }
  ];

  const targetId = "5a79cf99-2501-489e-ad09-cd4ca9bb39fa";
  console.log(`Searching for ID "${targetId}"...`);

  const results: any[] = [];

  for (const item of models) {
    if (!item.model) continue;
    try {
      const docs = await item.model.find({}).lean();
      for (const doc of docs) {
        const idVal = String((doc as any).id || (doc as any)._id || (doc as any).uid || '');
        const dataStr = JSON.stringify(doc);
        
        if (idVal.includes(targetId) || dataStr.includes(targetId)) {
          results.push({
            model: item.name,
            doc: doc
          });
        }
      }
    } catch (e: any) {
      console.error(`Error ${item.name}:`, e.message);
    }
  }

  fs.writeFileSync('./search_id_output.json', JSON.stringify(results, null, 2));
  console.log("Wrote search_id_output.json successfully.");
  
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
