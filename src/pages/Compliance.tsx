import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, FileText, RefreshCcw, ChevronLeft, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';

const PolicyLayout = ({ title, icon: Icon, children }: { title: string, icon: any, children: React.ReactNode }) => (
  <div className="min-h-screen bg-neutral-50 font-sans selection:bg-indigo-100 selection:text-sidebar">
    <nav className="bg-white border-b border-neutral-200 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-neutral-500 hover:text-sidebar transition-colors font-bold text-sm">
          <ChevronLeft className="w-4 h-4" />
          Back to Home
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-sidebar rounded-lg flex items-center justify-center text-white">
            <Icon className="w-5 h-5" />
          </div>
          <span className="font-black text-sidebar tracking-tight">Antony School Compliance</span>
        </div>
      </div>
    </nav>

    <main className="max-w-3xl mx-auto px-6 py-16">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 md:p-12 rounded-3xl border border-neutral-200 shadow-xl shadow-neutral-200/50"
      >
        <h1 className="text-4xl font-black text-sidebar tracking-tight mb-8 border-b border-neutral-100 pb-6">
          {title}
        </h1>
        <div className="prose prose-neutral max-w-none prose-h3:font-black prose-h3:text-sidebar prose-p:text-neutral-600 prose-p:leading-relaxed">
          {children}
        </div>
      </motion.div>
    </main>

    <footer className="bg-sidebar py-12 px-6">
      <div className="max-w-4xl mx-auto text-center border-t border-white/10 pt-8">
        <p className="text-neutral-400 text-xs font-bold uppercase tracking-widest leading-loose">
          © 2026 antonyschool.in | Powered by Spears Flow ERP
        </p>
      </div>
    </footer>
  </div>
);

export const PrivacyPolicy = () => (
  <PolicyLayout title="Privacy Policy" icon={ShieldCheck}>
    <section className="space-y-6">
      <p>Last updated: May 06, 2026</p>
      <p>At Antony School (antonyschool.in), we respect your privacy and are committed to protecting the personal data of our students, parents, and staff. This policy outlines how we handle your information.</p>
      
      <h3>1. Information We Collect</h3>
      <p>We collect personal information necessary for educational and administrative management, including:</p>
      <ul className="list-disc pl-6 space-y-2 text-neutral-600">
        <li>Student names, dates of birth, and academic records.</li>
        <li>Parent/Guardian contact details (Phone numbers, Email IDs, Address).</li>
        <li>Attendance records and disciplinary history.</li>
        <li>Medical history (if provided for safety reasons).</li>
      </ul>

      <h3>2. How We Use Information</h3>
      <p>Information is used strictly for school management purposes: monitoring academic progress, communicating school updates, attendance tracking, and managing admissions through our ERP system.</p>

      <h3>3. Data Security</h3>
      <p>Our ERP platform is secured using Google Firebase Infrastructure. We implement industry-standard encryption and access controls to ensure your data remains protected from unauthorized access.</p>

      <h3>4. Payment Transactions</h3>
      <p>For fee payments, we use Razorpay as our primary payment gateway. <strong>We do not store your credit card, debit card, or net banking credentials</strong> in our local servers. All financial data is handled strictly by Razorpay in compliance with PCI-DSS standards.</p>

      <h3>5. Contact Us</h3>
      <p>If you have questions about this policy, please contact us at support@antonyschool.in.</p>
    </section>
  </PolicyLayout>
);

export const RefundPolicy = () => (
  <PolicyLayout title="Refund & Cancellation Policy" icon={RefreshCcw}>
    <section className="space-y-6">
      <p>Antony School aims to provide a transparent fee management process. Please review our refund terms carefully.</p>
      
      <h3>1. Fee Refundability</h3>
      <p>School fees (including admission fees, tuition fees, and special activity fees) are generally <strong>non-refundable</strong> once paid, as resources are allocated based on student enrollment.</p>

      <h3>2. Technical Issues & Duplicate Payments</h3>
      <p>In the event of a technical glitch where the fee amount is debited more than once from your account, or a transaction is unsuccessful but the amount is deducted, please report the issue to the school administration desk immediately.</p>

      <h3>3. Refund Process</h3>
      <p>If a duplicate payment is verified, the surplus amount will be processed for a refund to the original payment method. The refund typically takes <strong>7-10 working days</strong> to reflect in your account, depending on your bank's policy.</p>

      <h3>4. Cancellations</h3>
      <p>Requests for withdrawal of admission or cancellation of school services must be submitted in writing to the Principal's office. Cancellation of admission does not guarantee a refund of the admission fee.</p>
    </section>
  </PolicyLayout>
);

export const TermsAndConditions = () => (
  <PolicyLayout title="Terms & Conditions" icon={FileText}>
    <section className="space-y-6">
      <p>Welcome to Antony School's ERP Portal. By accessing this website (antonyschool.in), you agree to comply with the following terms.</p>
      
      <h3>1. User Account Security</h3>
      <p>Parents and staff are issued secure login credentials. Users are solely responsible for maintaining the confidentiality of their login information. Any activity occurring under your account is your responsibility.</p>

      <h3>2. ERP Usage</h3>
      <p>The ERP portal is intended for academic and administrative use only. Any attempt to exploit, hack, or misuse the system data is strictly prohibited and may lead to legal action or suspension of access.</p>

      <h3>3. Academic Discretion</h3>
      <p>The school management reserves the right to update academic schedules, fee structures, and curriculum as deemed necessary by the Board of Directors without prior individual notice.</p>

      <h3>4. Communication</h3>
      <p>By using the portal, parents consent to receive official school notifications via SMS, Email, and WhatsApp through the ERP system.</p>

      <h3>5. Jurisdiction</h3>
      <p>Any disputes arising out of the use of this website or the school's services shall be subject to the exclusive jurisdiction of the local courts where the school is situated.</p>
    </section>
  </PolicyLayout>
);

export const FeeStructurePage = () => (
  <PolicyLayout title="Fee Structure & Pricing Policy" icon={CreditCard}>
    <section className="space-y-6">
      <p>Antony School maintains transparent billing procedures in alignment with regulatory guidelines for educational services. Below we outline our standard tuition and administrative fee structures for the 2026-2027 Academic Year.</p>
      
      <div className="overflow-x-auto my-6 border border-neutral-200 rounded-2xl">
        <table className="min-w-full divide-y divide-neutral-200 text-left text-sm text-neutral-600">
          <thead className="bg-neutral-50 text-neutral-900 font-bold uppercase tracking-wider text-xs">
            <tr>
              <th className="px-6 py-4">Academic Category</th>
              <th className="px-6 py-4">Admission Fee (One-Time)</th>
              <th className="px-6 py-4">Tuition Fee (Quarterly)</th>
              <th className="px-6 py-4">Lab & Library (Annual)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 divide-dashed">
            <tr>
              <td className="px-6 py-4 font-semibold text-neutral-900">Pre-Primary (Nursery, LKG, UKG)</td>
              <td className="px-6 py-4">₹15,000</td>
              <td className="px-6 py-4">₹12,500</td>
              <td className="px-6 py-4">₹3,000</td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-semibold text-neutral-900">Primary (Grades I - V)</td>
              <td className="px-6 py-4">₹20,000</td>
              <td className="px-6 py-4">₹15,000</td>
              <td className="px-6 py-4">₹4,500</td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-semibold text-neutral-900">Middle School (Grades VI - VIII)</td>
              <td className="px-6 py-4">₹25,000</td>
              <td className="px-6 py-4">₹18,000</td>
              <td className="px-6 py-4">₹5,000</td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-semibold text-neutral-900">High School (Grades IX - X)</td>
              <td className="px-6 py-4">₹30,000</td>
              <td className="px-6 py-4">₹21,000</td>
              <td className="px-6 py-4">₹6,500</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>1. Payment Modes & Security</h3>
      <p>All online payments are completed through the secure <strong>Razorpay Payment Gateway</strong> platform. Payments support UPI options, Indian Debit/Credit Cards (Visa, Mastercard, RuPay), Net Banking of 50+ central Indian banks, and approved wallet channels.</p>

      <h3>2. Payment Cycle & Due Dates</h3>
      <ul className="list-disc pl-6 space-y-2 text-neutral-600">
        <li><strong>Quarter 1:</strong> Due on or before June 15th</li>
        <li><strong>Quarter 2:</strong> Due on or before September 15th</li>
        <li><strong>Quarter 3:</strong> Due on or before December 15th</li>
        <li><strong>Quarter 4:</strong> Due on or before February 15th</li>
      </ul>

      <h3>3. Taxes & Gateway Levies</h3>
      <p>Academic services offered by accredited schools are typically exempt from Goods & Services Tax (GST) in India. However, any local bank gateway transaction charges or processing margins may be detailed during checkout depending on your payment choice.</p>

      <h3>4. Non-Payment Terms</h3>
      <p>Failing to clear school dues within 15 working days from the official due dates may trigger a standard late fee as decided by the administrative council. Parents can request extenuating deferrals in writing to the School Accounts Desk.</p>
    </section>
  </PolicyLayout>
);
