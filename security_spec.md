# Security Spec: School Management System RBAC

## Data Invariants
1. A user cannot modify student financial fields (`feeConcessionType`, `feeConcessionAmount`, `lastClassFeeDue`) unless they have the `students_manage_concessions` permission.
2. A user cannot modify student basic profile fields (name, rollNumber, etc.) unless they have the `students_edit_basic` permission.
3. System Admins and Management (Principal/Vice Principal) bypass these field-level checks.
4. Users can only update their own profile if they are the owner, but students cannot change their own roles or financial data.
5. `user_activities` are append-only (create only) for regular users, and read-only for users with `settings_logs`.
6. `student_permissions` can only be read by the student (owner), their parent, or staff with `attendance_manage`.
7. `leaves` can only be read by the applicant, their parent, or staff with `leaves_view`.

## The "Dirty Dozen" Payloads (Red Team Test Cases)

1. **Clerk Bypass Fee Check**: User with `students_edit_basic` only attempts to update `feeConcessionAmount`.
   - Result: `PERMISSION_DENIED`
2. **Vice Principal Basic Profile Injection**: User with `students_manage_concessions` only attempts to update `name`.
   - Result: `PERMISSION_DENIED`
3. **Ghost Field Injection**: User attempts to add a random field `isVerified: true` to a student record.
   - Result: `PERMISSION_DENIED`
4. **Role Escalation**: Student attempts to change their own role to `admin`.
   - Result: `PERMISSION_DENIED`
5. **Timestamp Spoofing**: User attempts to set a custom `updatedAt` instead of `request.time`.
   - Result: `PERMISSION_DENIED`
6. **Orphaned Record**: Creating a student without a valid `classId`.
   - Result: `PERMISSION_DENIED`
7. **Identity Spoofing**: User A attempts to update User B's profile without manager permissions.
   - Result: `PERMISSION_DENIED`
8. **Negative Fee**: User attempts to set `feeConcessionAmount` to -500.
   - Result: `PERMISSION_DENIED`
9. **Large ID**: Attempting to use a 2MB string as a document ID.
   - Result: `PERMISSION_DENIED`
10. **Immutable Field Change**: User with `students_edit_basic` attempts to change `uid` of a student.
    - Result: `PERMISSION_DENIED`
11. **PII Leak Inquiry**: Authenticated non-staff user attempts to 'get' private student PII fields they don't own.
    - Result: `PERMISSION_DENIED`
12. **Status shortcutting**: User sets status to 'dropped' without setting `dropDate`.
    - Result: `PERMISSION_DENIED`

## Red Team Conflict Report

| Collection | Identity Spoofing | State Shortcutting | Resource Poisoning | RBAC Precision |
|------------|-------------------|--------------------|--------------------|----------------|
| users      | Blocked (isOwner) | Blocked (isValid)  | Blocked (.size())  | Field-Level    |
| roles      | Blocked (Admin)   | N/A                | Blocked (.size())  | High           |
| insights   | Blocked (Admin)   | N/A                | Blocked (.size())  | Role-Based     |
| leaves     | Blocked (isOwner) | Blocked (isValid)  | Blocked (.size())  | Role-Based     |
| user_activities| Blocked (Append-only)| N/A          | Blocked (.size())  | Low-Impact     |
| student_permissions| Blocked (isOwner)| N/A        | Blocked (.size())  | Role-Based     |
| fees       | Blocked (Staff) | Blocked (isValid)  | Blocked (.size())  | Role-Based     |
