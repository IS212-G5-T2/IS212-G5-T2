import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// Testing Library's default 1000ms budget for findBy* and waitFor is too tight when the
// machine is busy (the suite is CPU-bound and runs in parallel workers). 5000ms keeps the
// wait bounded and still fails a genuinely missing element.
configure({ asyncUtilTimeout: 5000 });
