export const SUITES = {
  api: { args: ['run', 'src/features/equipment/api/equipment-api.test.ts'] },
  create: { args: ['run', 'src/features/equipment/pages/create/EquipmentCreatePage.test.tsx'] },
  formControls: { args: ['run', 'src/components/ui/FormControls.test.tsx'] },
};

export const MUTANTS = [
  {
    id: 'FE-111-01', name: 'equipment creation uses PUT instead of POST',
    file: 'src/features/equipment/api/equipment-api.ts', suites: ['api'],
    testMappings: [{ suite: 'api', file: 'src/features/equipment/api/equipment-api.test.ts', title: 'SPM-111 posts the complete equipment creation payload' }],
    edits: [["method: 'POST',", "method: 'PUT',"]],
  },
  {
    id: 'FE-111-02', name: 'dismissing confirmation navigates as if OK was acknowledged',
    file: 'src/features/equipment/pages/create/EquipmentCreatePage.tsx', suites: ['create'],
    testMappings: [{ suite: 'create', file: 'src/features/equipment/pages/create/EquipmentCreatePage.test.tsx', title: 'SPM-111 dismisses creation confirmation without acknowledging it' }],
    edits: [['onClose={() => setConfirmation("")}', 'onClose={acknowledgeConfirmation}']],
  },
  {
    id: 'FE-111-03', name: 'Escape clears the typed location while dismissing suggestions',
    file: 'src/components/ui/FormControls.tsx', suites: ['formControls'],
    testMappings: [{ suite: 'formControls', file: 'src/components/ui/FormControls.test.tsx', title: 'EQUIP-CRE-02-E preserves the typed location when Escape or outside click closes suggestions' }],
    edits: [['if (event.key === "Escape") setOpen(false);', 'if (event.key === "Escape") { onChange(""); setOpen(false); }']],
  },
  {
    id: 'FE-111-04', name: 'outside click clears the typed location while dismissing suggestions',
    file: 'src/components/ui/FormControls.tsx', suites: ['formControls'],
    testMappings: [{ suite: 'formControls', file: 'src/components/ui/FormControls.test.tsx', title: 'EQUIP-CRE-02-E preserves the typed location when Escape or outside click closes suggestions' }],
    edits: [['if (containerRef.current && !containerRef.current.contains(event.target as Node)) {', 'if (containerRef.current && !containerRef.current.contains(event.target as Node)) { onChange("");']],
  },
];
