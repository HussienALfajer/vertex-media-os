import { useUiSettings } from '@vertex-os/ui';

/**
 * Copy of the IAM department, role and permission administration (DESIGN_SYSTEM Sections 35 and
 * 38). Arabic is the first-run language; English is complete (the `en` object has the same type).
 * Counts are stated as "label: number" so no Arabic plural form is guessed.
 */
const ar = {
  departments: 'الأقسام',
  departmentsDescription:
    'الوحدات التنظيمية في Vertex Media. العضوية سياق تنظيمي ولا تمنح صلاحيات.',
  departmentsCaption: 'قائمة الأقسام',
  searchDepartments: 'البحث في الأقسام',
  searchByNameOrCode: 'بالاسم أو الرمز.',
  departmentsLoadFailed: 'تعذّر تحميل الأقسام',
  noDepartmentsTitle: 'لا توجد أقسام بعد',
  noDepartmentsCreate: 'أنشئ أول قسم لتنظيم الفريق.',
  noDepartmentsDescription: 'لم يُنشأ أي قسم بعد.',
  columnDepartment: 'القسم',
  columnState: 'الحالة',
  newDepartment: 'قسم جديد',
  createDepartment: 'إنشاء القسم',
  createDepartmentHelp: 'يُنشأ القسم نشطًا. لا يتغير رمزه بعد الإنشاء.',
  departmentCreated: 'أُنشئ القسم',
  departmentNotFound: 'القسم غير موجود',
  departmentNotFoundDetail: 'ربما أُدخل الرابط بشكل غير صحيح.',
  backToDepartments: 'العودة إلى الأقسام',
  departmentLoadFailed: 'تعذّر تحميل القسم',
  loadingDepartment: 'جارٍ تحميل القسم…',
  departmentUncertain:
    'لم تتأكد النتيجة، وقد يكون التغيير نُفّذ. حُمّلت حالة القسم الحالية؛ راجعها قبل إعادة المحاولة.',
  activateDepartment: 'تفعيل القسم',
  deactivateDepartment: 'إيقاف القسم',
  departmentActivated: 'فُعّل القسم',
  departmentActivatedDetail: 'عاد القسم سياقًا تنظيميًا لأعضائه.',
  departmentDeactivated: 'أُوقف القسم',
  departmentDeactivatedDetail: (name: string) =>
    `لم يعد «${name}» سياقًا تنظيميًا لأي عضو. بقيت العضويات محفوظة ويمكن تفعيل القسم مرة أخرى.`,
  departmentInactiveNotice: 'هذا القسم غير نشط',
  departmentInactiveDetail:
    'لا يدخل في السياق التنظيمي لأعضائه، ولا يمكن إضافة أعضاء جدد إليه. العضويات الحالية محفوظة.',
  deactivateDepartmentTitle: 'إيقاف القسم؟',
  deactivateDepartmentConsequence:
    'يخرج القسم فورًا من السياق التنظيمي لكل أعضائه، بما في ذلك من يعدّه قسمه الرئيسي. تبقى العضويات محفوظة، ولا يمكن إضافة أعضاء جدد حتى يُفعّل مرة أخرى.',
  deactivateReach: (count: number) => `عدد الأعضاء بكل حالات الوصول: ${count}`,
  members: 'الأعضاء',
  memberCount: (count: number) => `عدد المستخدمين: ${count}`,
  viewMembers: 'عرض الأعضاء',

  roles: 'الأدوار',
  rolesDescription: 'الأدوار تجمع الصلاحيات، وتُسند إلى المستخدمين.',
  rolesCaption: 'قائمة الأدوار',
  searchRoles: 'البحث في الأدوار',
  rolesLoadFailed: 'تعذّر تحميل الأدوار',
  noRolesTitle: 'لا توجد أدوار بعد',
  noRolesCreate: 'أنشئ دورًا ثم حدّد صلاحياته.',
  noRolesDescription: 'لم يُنشأ أي دور بعد.',
  columnRole: 'الدور',
  columnKind: 'النوع',
  systemRoleProtected: 'دور النظام (محمي)',
  customRole: 'دور مخصص',
  newRole: 'دور جديد',
  createRole: 'إنشاء الدور',
  createRoleHelp: 'يُنشأ الدور نشطًا بلا صلاحيات. لا يتغير رمزه بعد الإنشاء.',
  roleCreated: 'أُنشئ الدور',
  roleCreatedDetail: 'لا يمنح الدور أي صلاحية حتى تُحدَّد صلاحياته.',
  roleNotFound: 'الدور غير موجود',
  roleNotFoundDetail: 'ربما أُدخل الرابط بشكل غير صحيح.',
  backToRoles: 'العودة إلى الأدوار',
  roleLoadFailed: 'تعذّر تحميل الدور',
  loadingRole: 'جارٍ تحميل الدور…',
  roleUncertain:
    'لم تتأكد النتيجة، وقد يكون التغيير نُفّذ. حُمّلت حالة الدور الحالية؛ راجعها قبل إعادة المحاولة.',
  systemRoleNoticeTitle: 'دور نظام محمي',
  systemRoleNoticeDetail:
    'يحصل هذا الدور على كل صلاحية نشطة، وتُدار صلاحياته من الشيفرة. لا يُغيَّر اسمه ولا حالته ولا صلاحياته من الواجهة أو الواجهة البرمجية العادية.',
  roleInactiveNotice: 'هذا الدور غير نشط',
  roleInactiveDetail:
    'لا يمنح صلاحياته لأحد ولا يمكن إسناده. الإسنادات والصلاحيات المرتبطة محفوظة.',
  activateRole: 'تفعيل الدور',
  deactivateRole: 'إيقاف الدور',
  activateRoleTitle: 'تفعيل الدور؟',
  activateRoleConsequence:
    'تعود صلاحياته النشطة إلى كل من يحمله من طلبه التالي. يرفض النظام التفعيل إذا كانت تشمل صلاحيات لا تملكها أنت. يمكن إيقافه لاحقًا.',
  activateGrants: (count: number) => `الصلاحيات التي ستعود لحاملي الدور: ${count}`,
  activateGrantsNothing: 'لا يرتبط بالدور أي صلاحية.',
  roleActivated: 'فُعّل الدور',
  roleActivatedDetail: 'عادت صلاحياته إلى حامليه.',
  deactivateRoleTitle: 'إيقاف الدور؟',
  deactivateRoleConsequence:
    'تخرج صلاحياته من كل من يحمله من طلبه التالي. تبقى الإسنادات والصلاحيات المرتبطة محفوظة، ويمكن تفعيله مرة أخرى.',
  roleDeactivated: 'أُوقف الدور',
  roleDeactivatedDetail: 'لم تعد صلاحياته تُمنح لحامليه. بقيت الإسنادات محفوظة.',
  roleReach: (count: number) => `عدد حاملي الدور بكل حالات الوصول: ${count}`,
  holders: 'حاملو الدور',
  holderCount: (count: number) => `عدد المستخدمين: ${count}`,
  viewHolders: 'عرض حاملي الدور',
  rolePermissions: 'صلاحيات الدور',
  noMappedPermissions: 'لا يرتبط بالدور أي صلاحية.',

  permissions: 'الصلاحيات',
  permissionsDescription:
    'كتالوج الصلاحيات المسجّلة. تُعرّف الصلاحيات في الشيفرة وتُربط بالأدوار؛ لا تُنشأ من الواجهة.',
  permissionsCaption: 'كتالوج الصلاحيات',
  searchPermissions: 'البحث في الصلاحيات',
  catalogLoadFailed: 'تعذّر تحميل كتالوج الصلاحيات',
  noPermissionsTitle: 'لا توجد صلاحيات مسجّلة',
  noPermissionsDescription: 'تُسجَّل الصلاحيات من تعريفات الوحدات في الشيفرة.',
  columnPermission: 'الصلاحية',
  columnModule: 'الوحدة',
  columnSensitivity: 'الحساسية',
  retry: 'إعادة المحاولة',

  editPermissions: 'تعديل الصلاحيات',
  editPermissionsTitle: (role: string) => `صلاحيات الدور «${role}»`,
  editPermissionsHelp:
    'اختر من الصلاحيات النشطة المسجّلة. لا يمكن إضافة رمز غير موجود في الكتالوج. ستراجع التغييرات قبل الحفظ.',
  reviewHelp: 'راجع ما سيُضاف وما سيُزال قبل الحفظ.',
  selectModule: (module: string) => `كل صلاحيات ${module}`,
  droppedTitle: 'صلاحيات لم تعد نشطة ستُزال عند الحفظ',
  noAssignable: 'لا توجد صلاحيات نشطة يمكن ربطها.',
  noChanges: 'لم تغيّر شيئًا بعد.',
  reviewChanges: 'مراجعة التغييرات',
  backToEditing: 'العودة إلى التعديل',
  savePermissions: 'حفظ تغييرات الصلاحيات',
  addedTitle: (count: number) => `ستُضاف (${count})`,
  removedTitle: (count: number) => `ستُزال (${count})`,
  privilegedWarning: 'تضيف صلاحية امتيازية. تمنح كل من يحمل الدور قدرة إدارية واسعة.',
  reviewReach: (count: number) =>
    `يسري التغيير على حاملي الدور من طلبهم التالي. عدد حاملي الدور بكل حالات الوصول: ${count}`,
  reviewReachUnknown: 'يسري التغيير على كل من يحمل الدور من طلبه التالي.',
  permissionsConflictDetail:
    'غيّر مسؤول آخر صلاحيات هذا الدور. أُبقي اختيارك؛ حمّل أحدث نسخة وقارنها ثم راجع مرة أخرى.',
  latestPermissionsLoaded: 'حُمّلت أحدث نسخة. صلاحيات الدور المحفوظة الآن:',
  permissionsSaved: 'حُفظت صلاحيات الدور',
  permissionsSavedDetail: (count: number) => `عدد الصلاحيات المرتبطة الآن: ${count}`,

  code: 'الرمز',
  codeHelp: 'أحرف إنجليزية صغيرة وأرقام وشرطات مفردة، من 2 إلى 64 حرفًا. لا يتغير بعد الإنشاء.',
  codeRequired: 'أدخل الرمز.',
  codeInvalid: 'الرمز غير صالح. راجع القاعدة أسفل الحقل.',
  name: 'الاسم',
  nameRequired: 'أدخل الاسم.',
  nameInvalid: 'الاسم غير صالح: من حرف واحد إلى 200 حرف، بلا رموز تحكم.',
  description: 'الوصف',
  descriptionInvalid: 'الوصف غير صالح: حتى 2000 حرف، بلا رموز تحكم.',
  creating: 'جارٍ الإنشاء…',
  createUncertain: 'لم تتأكد النتيجة، وقد يكون السجل أُنشئ. راجع القائمة قبل إعادة المحاولة.',
  edit: 'تعديل',
  editTitle: 'تعديل الاسم والوصف',
  conflictDetail: 'غيّر مسؤول آخر هذا السجل. أُبقي ما أدخلته؛ حمّل أحدث نسخة ثم احفظ مرة أخرى.',
  stateConflict: 'تغيّر السجل منذ فتحه. حُمّلت الحالة الحالية؛ راجعها ثم أعد المحاولة إن لزم.',
  saved: 'حُفظت التغييرات',
};

export type OrganizationMessages = typeof ar;

const en: OrganizationMessages = {
  departments: 'Departments',
  departmentsDescription:
    'The organizational units of Vertex Media. Membership is organizational context and grants no permission.',
  departmentsCaption: 'Departments',
  searchDepartments: 'Search departments',
  searchByNameOrCode: 'By name or code.',
  departmentsLoadFailed: 'Departments could not be loaded',
  noDepartmentsTitle: 'No departments yet',
  noDepartmentsCreate: 'Create the first department to organize the team.',
  noDepartmentsDescription: 'No department has been created yet.',
  columnDepartment: 'Department',
  columnState: 'State',
  newDepartment: 'New department',
  createDepartment: 'Create department',
  createDepartmentHelp: 'The department starts active. Its code cannot change after creation.',
  departmentCreated: 'Department created',
  departmentNotFound: 'Department not found',
  departmentNotFoundDetail: 'The link may be incorrect.',
  backToDepartments: 'Back to departments',
  departmentLoadFailed: 'The department could not be loaded',
  loadingDepartment: 'Loading the department…',
  departmentUncertain:
    'The result is not confirmed, and the change may have been applied. The department’s current state is loaded; check it before trying again.',
  activateDepartment: 'Activate department',
  deactivateDepartment: 'Deactivate department',
  departmentActivated: 'Department activated',
  departmentActivatedDetail: 'The department is organizational context for its members again.',
  departmentDeactivated: 'Department deactivated',
  departmentDeactivatedDetail: (name: string) =>
    `“${name}” is no longer organizational context for any member. Memberships are kept, and the department can be activated again.`,
  departmentInactiveNotice: 'This department is inactive',
  departmentInactiveDetail:
    'It is not part of its members’ organizational context, and no new member can be added. Existing memberships are kept.',
  deactivateDepartmentTitle: 'Deactivate the department?',
  deactivateDepartmentConsequence:
    'The department leaves every member’s organizational context immediately, including as their primary department. Memberships are kept, and no new member can be added until it is activated again.',
  deactivateReach: (count: number) => `Members in any access state: ${count}`,
  members: 'Members',
  memberCount: (count: number) => `Users: ${count}`,
  viewMembers: 'View members',

  roles: 'Roles',
  rolesDescription: 'Roles group permissions and are assigned to users.',
  rolesCaption: 'Roles',
  searchRoles: 'Search roles',
  rolesLoadFailed: 'Roles could not be loaded',
  noRolesTitle: 'No roles yet',
  noRolesCreate: 'Create a role, then choose its permissions.',
  noRolesDescription: 'No role has been created yet.',
  columnRole: 'Role',
  columnKind: 'Kind',
  systemRoleProtected: 'System role (protected)',
  customRole: 'Custom role',
  newRole: 'New role',
  createRole: 'Create role',
  createRoleHelp:
    'The role starts active with no permissions. Its code cannot change after creation.',
  roleCreated: 'Role created',
  roleCreatedDetail: 'The role grants nothing until its permissions are chosen.',
  roleNotFound: 'Role not found',
  roleNotFoundDetail: 'The link may be incorrect.',
  backToRoles: 'Back to roles',
  roleLoadFailed: 'The role could not be loaded',
  loadingRole: 'Loading the role…',
  roleUncertain:
    'The result is not confirmed, and the change may have been applied. The role’s current state is loaded; check it before trying again.',
  systemRoleNoticeTitle: 'Protected system role',
  systemRoleNoticeDetail:
    'This role receives every active permission, and its permissions are managed in code. Its name, state and permissions cannot be changed through the ordinary UI or API.',
  roleInactiveNotice: 'This role is inactive',
  roleInactiveDetail:
    'It grants its permissions to no one and cannot be assigned. Its assignments and mappings are kept.',
  activateRole: 'Activate role',
  deactivateRole: 'Deactivate role',
  activateRoleTitle: 'Activate the role?',
  activateRoleConsequence:
    'Its active permissions return to every holder on their next request. The system refuses if they include permissions you do not hold yourself. It can be deactivated later.',
  activateGrants: (count: number) => `Permissions returned to the role’s holders: ${count}`,
  activateGrantsNothing: 'No permission is mapped to the role.',
  roleActivated: 'Role activated',
  roleActivatedDetail: 'Its permissions are granted to its holders again.',
  deactivateRoleTitle: 'Deactivate the role?',
  deactivateRoleConsequence:
    'Its permissions leave every holder on their next request. Assignments and mappings are kept, and the role can be activated again.',
  roleDeactivated: 'Role deactivated',
  roleDeactivatedDetail:
    'Its permissions are no longer granted to its holders. Assignments are kept.',
  roleReach: (count: number) => `Holders in any access state: ${count}`,
  holders: 'Holders',
  holderCount: (count: number) => `Users: ${count}`,
  viewHolders: 'View holders',
  rolePermissions: 'Role permissions',
  noMappedPermissions: 'No permission is mapped to the role.',

  permissions: 'Permissions',
  permissionsDescription:
    'The catalog of registered permissions. Permissions are defined in code and mapped to roles; they are not created here.',
  permissionsCaption: 'Permission catalog',
  searchPermissions: 'Search permissions',
  catalogLoadFailed: 'The permission catalog could not be loaded',
  noPermissionsTitle: 'No registered permissions',
  noPermissionsDescription: 'Permissions are registered from the modules’ definitions in code.',
  columnPermission: 'Permission',
  columnModule: 'Module',
  columnSensitivity: 'Sensitivity',
  retry: 'Try again',

  editPermissions: 'Edit permissions',
  editPermissionsTitle: (role: string) => `Permissions of “${role}”`,
  editPermissionsHelp:
    'Choose from the registered active permissions. A code outside the catalog cannot be added. You review the changes before saving.',
  reviewHelp: 'Review what is added and removed before saving.',
  selectModule: (module: string) => `All ${module} permissions`,
  droppedTitle: 'Permissions no longer active will be removed on save',
  noAssignable: 'No active permission can be mapped.',
  noChanges: 'You have not changed anything yet.',
  reviewChanges: 'Review changes',
  backToEditing: 'Back to editing',
  savePermissions: 'Save permission changes',
  addedTitle: (count: number) => `Added (${count})`,
  removedTitle: (count: number) => `Removed (${count})`,
  privilegedWarning:
    'You are adding a privileged permission. It gives everyone holding the role broad administrative power.',
  reviewReach: (count: number) =>
    `The change applies to the role’s holders on their next request. Holders in any access state: ${count}`,
  reviewReachUnknown: 'The change applies to everyone holding the role on their next request.',
  permissionsConflictDetail:
    'Another administrator changed this role’s permissions. Your choice is kept; load the latest version, compare, then review again.',
  latestPermissionsLoaded: 'The latest version is loaded. The role’s saved permissions now:',
  permissionsSaved: 'Role permissions saved',
  permissionsSavedDetail: (count: number) => `Permissions mapped now: ${count}`,

  code: 'Code',
  codeHelp:
    'Lowercase letters, digits and single hyphens, 2 to 64 characters. It cannot change after creation.',
  codeRequired: 'Enter the code.',
  codeInvalid: 'The code is not valid. See the rule below the field.',
  name: 'Name',
  nameRequired: 'Enter the name.',
  nameInvalid: 'The name is not valid: 1 to 200 characters, without control characters.',
  description: 'Description',
  descriptionInvalid:
    'The description is not valid: up to 2,000 characters, without control characters.',
  creating: 'Creating…',
  createUncertain:
    'The result is not confirmed, and the record may have been created. Check the list before trying again.',
  edit: 'Edit',
  editTitle: 'Edit name and description',
  conflictDetail:
    'Another administrator changed this record. Your entry is kept; load the latest version, then save again.',
  stateConflict:
    'The record changed since you opened it. The current state is loaded; check it, then try again if still needed.',
  saved: 'Changes saved',
};

const messages = { ar, en };

export function useOrganizationMessages(): OrganizationMessages {
  return messages[useUiSettings().language];
}
