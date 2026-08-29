import { getDbAdmin } from '../../firebaseAdmin.js';
import { StudentHealthAccount, StudentHealthBill, StudentHealthLedgerEntry } from '../../../modules/studentHealth/types/index.js';

export async function processBillApprovalAndDeduction(
  schoolId: string,
  billId: string,
  approvedByUserId: string
): Promise<{ success: boolean; error?: string }> {
  const db = getDbAdmin();

  try {
    await db.runTransaction(async (transaction) => {
      const billRef = db.collection('student_health_bills').doc(billId);
      const billDoc = await transaction.get(billRef);

      if (!billDoc.exists) {
        throw new Error("Bill not found");
      }

      const billData = billDoc.data() as StudentHealthBill;
      if (billData.status !== 'PENDING_ADMIN_REVIEW') {
        throw new Error(`Only pending bills can be approved. Current status: ${billData.status}`);
      }

      const { studentId, totalAmount, studentType, studentName, className, batchName } = billData;

      // 1. Find or create StudentHealthAccount
      const accountSnap = await transaction.get(
        db.collection('student_health_accounts')
          .where('schoolId', '==', schoolId)
          .where('studentId', '==', studentId)
          .limit(1)
      );

      let accountRef;
      let accountData: StudentHealthAccount;

      if (accountSnap.empty) {
        // Create an account on-the-fly with defaults
        const isHosteler = studentType === 'HOSTELER';
        const cardEnabled = isHosteler; // Hostel card enabled by default, day scholar disabled
        const initialBal = isHosteler ? 2000 : 0;
        
        const newAccountDoc = db.collection('student_health_accounts').doc();
        accountRef = newAccountDoc;

        accountData = {
          id: newAccountDoc.id,
          schoolId,
          studentId,
          studentName,
          className,
          batchName,
          studentType,
          healthCardEnabled: cardEnabled,
          openingBalance: initialBal,
          currentBalance: initialBal,
          totalMedicalBills: 0,
          totalDeductedFromCard: 0,
          totalExtraPayable: 0,
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        transaction.set(accountRef, accountData);
      } else {
        const docSnap = accountSnap.docs[0];
        accountRef = docSnap.ref;
        accountData = docSnap.data() as StudentHealthAccount;
      }

      // Check if health card is enabled
      const isCardEnabled = accountData.healthCardEnabled && accountData.status === 'ACTIVE';
      const balanceBefore = isCardEnabled ? accountData.currentBalance : 0;

      let deductedFromHealthCard = 0;
      let extraPayableAmount = totalAmount;

      if (isCardEnabled && balanceBefore > 0) {
        if (balanceBefore >= totalAmount) {
          deductedFromHealthCard = totalAmount;
          extraPayableAmount = 0;
        } else {
          deductedFromHealthCard = balanceBefore;
          extraPayableAmount = totalAmount - balanceBefore;
        }
      }

      const balanceAfter = balanceBefore - deductedFromHealthCard;

      // 2. Update StudentHealthAccount totals
      const updatedAccount: Partial<StudentHealthAccount> = {
        currentBalance: balanceAfter,
        totalMedicalBills: accountData.totalMedicalBills + totalAmount,
        totalDeductedFromCard: accountData.totalDeductedFromCard + deductedFromHealthCard,
        totalExtraPayable: accountData.totalExtraPayable + extraPayableAmount,
        updatedAt: new Date().toISOString()
      };

      transaction.update(accountRef, updatedAccount);

      // 3. Update the Bill document
      const updatedBill: Partial<StudentHealthBill> = {
        status: "APPROVED",
        approvedByUserId,
        approvedAt: new Date().toISOString(),
        deductedFromHealthCard,
        extraPayableAmount,
        balanceBefore,
        balanceAfter,
        updatedAt: new Date().toISOString()
      };

      transaction.update(billRef, updatedBill);

      // 4. Create Ledger Entry
      const ledgerRef = db.collection('student_health_ledger').doc();
      const ledgerEntry: StudentHealthLedgerEntry = {
        id: ledgerRef.id,
        schoolId,
        studentId,
        billId,
        hospitalId: billData.hospitalId,
        transactionType: "BILL_APPROVAL",
        amount: totalAmount,
        balanceBefore,
        balanceAfter,
        extraPayableAmount,
        remarks: `Bill Approved - Deducted: ₹${deductedFromHealthCard}, Extra dues: ₹${extraPayableAmount}`,
        createdByUserId: approvedByUserId,
        createdAt: new Date().toISOString()
      };

      transaction.set(ledgerRef, ledgerEntry);

      // 5. Audit Log Entry
      const auditRef = db.collection('student_health_audit_logs').doc();
      transaction.set(auditRef, {
        id: auditRef.id,
        schoolId,
        hospitalId: billData.hospitalId,
        studentId,
        billId,
        userId: approvedByUserId,
        role: "ADMIN",
        action: "BILL_APPROVED",
        beforeData: { status: "PENDING_ADMIN_REVIEW" },
        afterData: { 
          status: "APPROVED", 
          deductedFromHealthCard, 
          extraPayableAmount,
          balanceBefore,
          balanceAfter 
        },
        createdAt: new Date().toISOString()
      });
    });

    return { success: true };
  } catch (err) {
    console.error("[healthCardLedgerService] Error committing transaction:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function processBillRejection(
  schoolId: string,
  billId: string,
  rejectedByUserId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const db = getDbAdmin();

  try {
    const billRef = db.collection('student_health_bills').doc(billId);
    const billDoc = await billRef.get();

    if (!billDoc.exists) {
      return { success: false, error: "Bill not found" };
    }

    const billData = billDoc.data() as StudentHealthBill;
    if (billData.status !== "PENDING_ADMIN_REVIEW") {
      return { success: false, error: "Only pending bills can be rejected" };
    }

    const batch = db.batch();

    // Update bill
    batch.update(billRef, {
      status: "REJECTED",
      rejectedByUserId,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason,
      updatedAt: new Date().toISOString()
    });

    // Create audit log
    const auditRef = db.collection('student_health_audit_logs').doc();
    batch.set(auditRef, {
      id: auditRef.id,
      schoolId,
      hospitalId: billData.hospitalId,
      studentId: billData.studentId,
      billId,
      userId: rejectedByUserId,
      role: "ADMIN",
      action: "BILL_REJECTED",
      beforeData: { status: "PENDING_ADMIN_REVIEW" },
      afterData: { status: "REJECTED", rejectionReason: reason },
      createdAt: new Date().toISOString()
    });

    await batch.commit();
    return { success: true };
  } catch (err) {
    console.error("[healthCardLedgerService] Error rejecting bill:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
