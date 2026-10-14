export const SUITES = {
  api: { args: ['run', 'src/features/equipment/api/equipment-api.test.ts'] },
  audit: { args: ['run', 'src/features/equipment/pages/audit-trail/AuditTrailPage.test.tsx'] },
  availability: { args: ['run', 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.test.tsx'] },
};

export const MUTANTS = [
  {
    id: 'FE-119-01', name: 'availability update uses POST instead of PATCH',
    file: 'src/features/equipment/api/equipment-api.ts', suites: ['api'],
    testMappings: [{ suite: 'api', file: 'src/features/equipment/api/equipment-api.test.ts', title: 'SPM-119 patches an equipment availability payload' }],
    edits: [["method: 'PATCH',", "method: 'POST',"]],
  },
  {
    id: 'FE-119-02', name: 'audit trail requests the inventory endpoint',
    file: 'src/features/equipment/api/equipment-api.ts', suites: ['api'],
    testMappings: [{ suite: 'api', file: 'src/features/equipment/api/equipment-api.test.ts', title: 'SPM-119 gets the shared equipment audit trail' }],
    edits: [["return api<EquipmentAuditEntry[]>('/equipment/audit-trail');", "return api<EquipmentAuditEntry[]>('/equipment');"]],
  },
  {
    id: 'FE-119-03', name: 'audit load rejection is shown as a successful empty history',
    file: 'src/features/equipment/pages/audit-trail/AuditTrailPage.tsx', suites: ['audit'],
    testMappings: [{ suite: 'audit', file: 'src/features/equipment/pages/audit-trail/AuditTrailPage.test.tsx', title: 'SPM-119 AC5 displays the audit-trail load error' }],
    edits: [['setLoadError(true);', 'setLoadError(false);']],
  },
  {
    id: 'FE-119-04', name: 'failed unavailable reload retains a success state',
    file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.tsx', suites: ['availability'],
    testMappings: [{ suite: 'availability', file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.test.tsx', title: 'SPM-119 AC4 displays an error when Show unavailable reload fails' }],
    edits: [['    } catch {\r\n      setRecords([]);\r\n      setLoadError(true);', '    } catch {\r\n      setRecords([]);\r\n      setLoadError(false);']],
  },
  {
    id: 'FE-119-05', name: 'toast dismiss button preserves the success message',
    file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.tsx', suites: ['availability'],
    testMappings: [{ suite: 'availability', file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.test.tsx', title: 'SPM-119 AC1 dismisses the availability success toast' }],
    edits: [['onClick={() => setToast("")}', 'onClick={() => setToast(toast)}']],
  },
  {
    id: 'FE-119-06', name: 'reactivation cancel confirms the update',
    file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.tsx', suites: ['availability'],
    testMappings: [{ suite: 'availability', file: 'src/features/equipment/pages/availability/EquipmentAvailabilityPage.test.tsx', title: 'SPM-119 AC6 cancels reactivation without updating equipment' }],
    edits: [['          onConfirm={() => void handleReactivate()}\r\n          onCancel={() => setDialog(null)}', '          onConfirm={() => void handleReactivate()}\r\n          onCancel={() => void handleReactivate()}']],
  },
];
