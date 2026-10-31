// SPM-128 Safety Officer Login mutation suite.
// Each mutant removes or corrupts one piece of the SPM-128 role wiring and names the test that must catch it.
export const SUITES = {
  auth: {
    args: ['run', 'src/lib/auth.test.ts'],
  },
  nav: {
    args: ['run', 'src/components/layout/navConfig.test.ts'],
  },
  app: {
    args: ['run', 'src/app/App.test.tsx'],
  },
};

const AUTH_SRC = 'src/lib/auth.ts';
const AUTH_TEST = 'src/lib/auth.test.ts';
const NAV_SRC = 'src/components/layout/navConfig.ts';
const NAV_TEST = 'src/components/layout/navConfig.test.ts';
const APP_SRC = 'src/app/App.tsx';
const APP_TEST = 'src/app/App.test.tsx';

export const MUTANTS = [
  {
    id: 'FE-128-01',
    name: 'SAFETY_OFFICER role mapping is removed from roleByDatabaseRole in auth.ts',
    file: AUTH_SRC,
    suites: ['auth'],
    testMappings: [{
      suite: 'auth',
      file: AUTH_TEST,
      title: 'SAFETY-LOGIN-01-A recognises the Safety Officer role from the server',
    }],
    edits: [[
      '  { databaseRole: "COORDINATOR_LEAD", role: "coordinator_lead" },\n  { databaseRole: "SAFETY_OFFICER", role: "safety_officer" },',
      '  { databaseRole: "COORDINATOR_LEAD", role: "coordinator_lead" },',
    ]],
  },
  {
    id: 'FE-128-02',
    name: 'homePathByRole for safety_officer changed away from /safety/events',
    file: NAV_SRC,
    suites: ['app'],
    testMappings: [{
      suite: 'app',
      file: APP_TEST,
      title: 'SAFETY-LOGIN-02-A redirects a Safety Officer from root to the safety review page',
    }],
    edits: [[
      '  safety_officer: "/safety/events",',
      '  safety_officer: "/events",',
    ]],
  },
  {
    id: 'FE-128-03',
    name: 'safety_officer removed from RequireRole allowedRoles in App.tsx',
    file: APP_SRC,
    suites: ['app'],
    testMappings: [
      {
        suite: 'app',
        file: APP_TEST,
        title: 'SAFETY-LOGIN-02-B redirects an authenticated Safety Officer from login to the safety review page',
      },
      {
        suite: 'app',
        file: APP_TEST,
        title: 'SAFETY-LOGIN-04-A Safety Officer at own route renders the safety review page',
      },
    ],
    edits: [[
      '<Route element={<RequireRole allowedRoles={["safety_officer"]} />}>',
      '<Route element={<RequireRole allowedRoles={[]} />}>',
    ]],
  },
  {
    id: 'FE-128-04',
    name: '/safety/events route path changed to /safety/review in App.tsx',
    file: APP_SRC,
    suites: ['app'],
    testMappings: [{
      suite: 'app',
      file: APP_TEST,
      title: 'SAFETY-LOGIN-04-A Safety Officer at own route renders the safety review page',
    }],
    edits: [[
      '<Route path="/safety/events" element={<SafetyCheckQueuePage />} />',
      '<Route path="/safety/review" element={<SafetyCheckQueuePage />} />',
    ]],
  },
  {
    id: 'FE-128-05',
    name: 'navByRole safety_officer entry removed in navConfig.ts',
    file: NAV_SRC,
    suites: ['nav'],
    testMappings: [{
      suite: 'nav',
      file: NAV_TEST,
      title: 'SAFETY-LOGIN-02-C navigation sidebar shows exactly Safety Review -> /safety/events',
    }],
    edits: [[
      '  safety_officer: [\n    { label: "Safety Review", to: "/safety/events", icon: "🛡️", feature: "SPM-128" },\n  ],',
      '  safety_officer: [],',
    ]],
  },
  {
    id: 'FE-128-06',
    name: 'roleLabels for safety_officer changed in navConfig.ts',
    file: NAV_SRC,
    suites: ['nav'],
    testMappings: [{
      suite: 'nav',
      file: NAV_TEST,
      title: 'SAFETY-LOGIN-02-C navigation sidebar shows exactly Safety Review -> /safety/events',
    }],
    edits: [[
      '  safety_officer: "Safety Officer",',
      '  safety_officer: "Officer",',
    ]],
  },
  {
    id: 'FE-128-07',
    name: 'safety_officer allowed into /events route in App.tsx',
    file: APP_SRC,
    suites: ['app'],
    testMappings: [{
      suite: 'app',
      file: APP_TEST,
      title: 'SAFETY-LOGIN-04-B Safety Officer at /events is redirected to own page',
    }],
    edits: [[
      'allowedRoles={["coordinator", "organiser", "attendee", "venue_staff", "tech_support"]}',
      'allowedRoles={["coordinator", "organiser", "attendee", "venue_staff", "tech_support", "safety_officer"]}',
    ]],
  },
  {
    id: 'FE-128-08',
    name: 'Wrong password in login does not throw AuthError with server message',
    file: AUTH_SRC,
    suites: ['auth'],
    testMappings: [
      {
        suite: 'auth',
        file: AUTH_TEST,
        title: 'SAFETY-LOGIN-01-B wrong password returns AuthError with status 401',
      },
    ],
    edits: [[
      '  const body = await readBody(response);\n  if (!response.ok) throw new AuthError(response.status, body.message);\n  const user = toLocalUser',
      '  const body = await readBody(response);\n  if (!response.ok) throw new AuthError(response.status, "Default error");\n  const user = toLocalUser',
    ]],
  },
  {
    id: 'FE-128-09',
    name: 'Non-JSON body error in login does not fall back to generic message',
    file: AUTH_SRC,
    suites: ['auth'],
    testMappings: [
      {
        suite: 'auth',
        file: AUTH_TEST,
        title: 'SAFETY-LOGIN-01-C non-JSON error body falls back to generic message',
      },
    ],
    edits: [[
      'super(message || "We couldn\'t sign you in. Please try again.");',
      'super(message || "Error occurred");',
    ]],
  },
  {
    id: 'FE-128-10',
    name: 'toLocalUser ignores role casing and whitespace trimming',
    file: AUTH_SRC,
    suites: ['auth'],
    testMappings: [{
      suite: 'auth',
      file: AUTH_TEST,
      title: 'SAFETY-LOGIN-01-D mixed-case or whitespace-padded role is still recognised',
    }],
    edits: [[
      'const databaseRoles = new Set(account.roles.map((role) => role.trim().toUpperCase()));',
      'const databaseRoles = new Set(account.roles);',
    ]],
  },
  {
    id: 'FE-128-11',
    name: 'Login with unmapped role allows unauthenticated user instead of throwing 403',
    file: AUTH_SRC,
    suites: ['auth'],
    testMappings: [{
      suite: 'auth',
      file: AUTH_TEST,
      title: 'SAFETY-LOGIN-03-C valid HTTP 200 but no supported role denies access',
    }],
    edits: [[
      'if (!user) throw new AuthError(403, "This account does not have a supported ConnectSphere role.");',
      'if (!user) return {} as User;',
    ]],
  },
  {
    id: 'FE-128-12',
    name: 'Coordinator allowed into safety review route in App.tsx',
    file: APP_SRC,
    suites: ['app'],
    testMappings: [{
      suite: 'app',
      file: APP_TEST,
      title: 'SAFETY-LOGIN-04-C blocks coordinator from the safety events route',
    }],
    edits: [[
      '<Route element={<RequireRole allowedRoles={["safety_officer"]} />}>',
      '<Route element={<RequireRole allowedRoles={["safety_officer", "coordinator"]} />}>',
    ]],
  },
  {
    id: 'FE-128-13',
    name: 'Organiser allowed into safety review route in App.tsx',
    file: APP_SRC,
    suites: ['app'],
    testMappings: [{
      suite: 'app',
      file: APP_TEST,
      title: 'SAFETY-LOGIN-04-D blocks organiser from the safety events route',
    }],
    edits: [[
      '<Route element={<RequireRole allowedRoles={["safety_officer"]} />}>',
      '<Route element={<RequireRole allowedRoles={["safety_officer", "organiser"]} />}>',
    ]],
  },
  {
    id: 'FE-128-14',
    name: 'Attendee allowed into safety review route in App.tsx',
    file: APP_SRC,
    suites: ['app'],
    testMappings: [{
      suite: 'app',
      file: APP_TEST,
      title: 'SAFETY-LOGIN-04-E blocks attendee from the safety events route',
    }],
    edits: [[
      '<Route element={<RequireRole allowedRoles={["safety_officer"]} />}>',
      '<Route element={<RequireRole allowedRoles={["safety_officer", "attendee"]} />}>',
    ]],
  },
];
