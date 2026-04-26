# OnePortal — Project Instructions

## Goal

A web-based test management system for uploading, executing, assigning, and tracking
test cases across projects. Supports Excel-based test design with live status tracking,
role-based project access, and a graphical dashboard per project.

---

## Current Architecture

| Layer | Stack |
|-------|-------|
| Backend | Spring Boot 3.2, Java 17, JPA/Hibernate, H2 (dev) / PostgreSQL (prod), Flyway, Apache POI, Springdoc OpenAPI, Lombok |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, React Router 7, TanStack Query, Axios, Recharts, xlsx, Lucide React |

---

## Core Entities (implemented)

| Entity | Key Fields |
|--------|-----------|
| `User` | username, email, password, `Role` (ADMIN / TESTER / VIEWER), enabled, audit timestamps |
| `Project` | name, description, members, test cases, audit timestamps |
| `ProjectMember` | project, user, `ProjectRole` (OWNER / TESTER / VIEWER), joinedAt |
| `TestDesignSheet` | fileName, sheetName, uploadedBy, project, rows, createdAt |
| `TestDesignRow` | sheet, rowIndex, rowData (JSON map), assignedTo, `rowStatus` (NOT_STARTED / IN_PROGRESS / PASSED / FAILED / BLOCKED) |
| `TestCase` | title, description, steps, expectedResult, priority, status (DRAFT / ACTIVE / DEPRECATED), module, tag, project, assignedTo, executions |
| `TestExecution` | testCase, executedBy, `executionStatus` (PENDING / IN_PROGRESS / PASSED / FAILED / BLOCKED / SKIPPED), actualResult, comments, buildVersion, environment, durationMs, startedAt, finishedAt |
| `DefectSheet` | fileName, sheetName, project, uploadedBy, idColumnName, summaryColumnName, rows, createdAt |
| `DefectRow` | sheet, rowIndex, defectId, summary, rowData (JSON map) |

**Not yet implemented:** `Screenshot`

---

## Built Features

### Authentication & Users
- Signup with admin approval flow; pending users cannot log in until approved
- Login with password verification; session stored in React context + localStorage
- User management page (`/users`): create, delete, approve with role assignment
- "Log in as" switcher in navbar for testing different user roles

### Projects (`/projects`)
- Create projects with optional Excel test design upload at creation time
- Delete project: allowed for project OWNER or global ADMIN; cascades to linked sheet and rows
- Role-based project membership: OWNER, TESTER, VIEWER

### Project Dashboard (`/projects/:projectId`)
- Project header with member role badge (current user)
- Members panel: view all members; OWNER can add / remove members
- Test Design summary card: total / passed / failed / assigned counts
- **Pass-rate health score**: progress bar showing `passed / total × 100` with colour coding (green ≥80%, yellow ≥50%, red below)
- **Replace Test Design** button (OWNER only): uploads a new `.xlsx`, drops the old sheet, auto-maps columns:
  - Column named `Status` → maps cell values to `rowStatus` enum
  - Column named `Assigned To` → looks up user by username and sets `assignedTo`
  - Column named `Linked Defects` / `Linked Defect` (preferred) or `Defects` / `Defect` (fallback) → auto-links matched defect IDs; strips leading non-numeric prefixes like `D#` before lookup; only links IDs that exist in the project's uploaded defect extract
- **Execution Status donut chart**: distribution of `rowStatus` across all rows
- **Assignment stacked bar chart**: per-assignee breakdown by status
- **Defect Status chart**: donut + breakdown table showing defect distribution by the user-chosen Status Column (only visible when `statusColumnName` is set on the defect sheet)
- "View All Test Cases →" button
- **Defect Extract delete**: fixed — now properly cleans up `test_design_row_linked_defects` join entries before deleting defect rows; uses `deleteById` to avoid JPA cascade conflict; `defectSheet` query returns `null` on 404 so UI immediately shows the empty state after deletion

### Test Cases Page (`/projects/:projectId/test-cases`)
- Searchable, sortable, paginated table of all Excel rows with Assigned To and Status columns
- Configurable page size: 10 / 25 / 50 / 100 rows per page
- Proper sliding-window pagination with ellipsis gaps (no duplicate page numbers)
- **Inline cell editing** (OWNER / TESTER): click any data cell to edit in place
- **Assigned To dropdown** (OWNER only): reassign rows to project members
- **Status dropdown** (OWNER / TESTER): change row execution status
- **Linked Defects** click-triggered dropdown (OWNER / TESTER): click pills to open; searchable checkbox list showing `defectId — summary`; closes on outside click; displayed as pill badges; only visible when a defect extract is uploaded
- **Functional columns hidden from raw data**: Excel columns whose headers match `Status`, `Assigned To`, `Linked Defects`, `Defects`, `Defect` are filtered out of the raw data column display — they are captured by their dedicated functional columns instead
- **Save button** per row: batches cell edits + assignment + status + linked defects into one PATCH call
- **Add Row** (OWNER / TESTER): appends a blank row at the end, jumps to last page
- **Delete Row** (OWNER / TESTER): trash icon per row + confirmation overlay modal
- **Export to Excel** (all roles): exports all filtered rows including Assigned To and Status columns
- **Per-column filters**: text inputs below each data column header; Status dropdown filter; Assigned To dropdown filter; active filter badge with Clear All button
- **Bulk status update**: row checkboxes + "Set status for selected" toolbar; applies PATCH to all selected rows in parallel
- **Row detail panel**: expand icon per row opens a slide-in side panel with all column values, linked defects, status badge, and audit trail
- **Audit trail tooltip**: hover over row number shows last modified date/time and username

### Defect Extract (`/projects/:projectId/defects`)
- Upload QC defect extract `.xlsx` from the Project Dashboard with a 2-step column mapping flow
- Column mapping modal: user picks Defect ID column, Summary column, and an optional **Status Column** (enables defect status chart on dashboard)
- Replace existing defect sheet for a project (OWNER only)
- **Delete defect extract**: cleans stale `test_design_row_linked_defects` join entries, then deletes rows and sheet by ID (no JPA cascade conflict); `projectDetailPage` query handles 404 gracefully
- **Linked Defects** click-triggered dropdown on the Test Cases page: click to open, search filter, checkboxes to toggle links, outside-click to close; supports multiple defects per row; batched into existing Save call
- **View Defects** page: searchable, sortable, paginated, exportable table of all defect rows
- **Defect CRUD** (OWNER / TESTER): inline cell editing, Add Row, Delete Row with confirmation modal; delete also cleans up `test_design_row_linked_defects` join entries
- **Linked Tests column** on defects page: shows whether each defect row is linked to any test case
- Defect sheet cascade-deleted when project is deleted
- **Audit trail** on defect rows: `updatedAt` + `updatedByUsername` shown in row detail panel and as tooltip on row number

### Standalone Test Designs (`/test-designs`)
- Upload Excel without project linkage
- List all uploaded sheets; link to per-sheet view
- Per-sheet view (`/test-designs/:sheetId`): read-only table, search, sort, pagination, export, delete sheet

---

## REST API Surface

| Controller | Base Path | Notable Endpoints |
|-----------|-----------|-------------------|
| `AuthController` | `/api/v1/auth` | POST /signup, /login, /verify-password |
| `UserController` | `/api/v1/users` | GET (paginated), GET /:id, POST, PATCH /:id, DELETE /:id, POST /:id/approve |
| `ProjectController` | `/api/v1/projects` | GET, GET /:id, POST, DELETE /:id, GET /:id/members, POST /:id/members, DELETE /:id/members/:userId |
| `ExcelController` | `/api/v1/excel` | POST /upload, POST /replace, GET /sheets, GET /sheets/:id, GET /sheets/by-project/:pid, PATCH /sheets/:id/rows/:rid, POST /sheets/:id/rows, DELETE /sheets/:id/rows/:rid, DELETE /sheets/:id |
| `DefectController` | `/api/v1/defects` | POST /parse-headers, POST /sheets, GET /sheets/by-project/:pid, GET /sheets/:id/rows, GET /dropdown, DELETE /sheets/:id |
| `TestCaseController` | `/api/v1/test-cases` | Full CRUD + search + assign (backend only, no frontend UI yet) |
| `TestExecutionController` | `/api/v1/test-executions` | Full CRUD (backend only, no frontend UI yet) |

---

## Known Gaps

- `TestCase` and `TestExecution` APIs exist on the backend but **no frontend page uses them** — the main workflow drives `TestDesignRow` (Excel rows) for test case management
- All API routes are currently `permitAll()` — no JWT or session token validation on backend requests
- No `Screenshot` entity or upload endpoint
- `assignTestCase` helper in `frontend/src/api/projectApi.ts` is exported but never called

---

## Phase 2 Roadmap

- [ ] **Execution UI**: connect `TestExecution` API to frontend — create execution runs per test case, view execution history, capture actual results
- [ ] **Screenshot upload**: `Screenshot` entity, `POST /api/v1/screenshots` endpoint, drag-and-drop upload UI on test case rows
- [ ] **Word/DOCX export**: generate a formatted test report with embedded screenshots
- [ ] **Defect / bug link**: `DefectLink` entity, backend API, UI to attach Jira / HP ALM ticket IDs to failed rows
- [ ] **SharePoint integration**: publish generated test reports to a SharePoint document library
- [ ] **QC (HP ALM) integration**: bidirectional sync of test cases and execution results to Quality Center
- [ ] **Power BI reporting**: aggregated metrics endpoint (`/api/v1/reports/summary`) consumable by Power BI
- [ ] **JWT authentication**: replace permit-all `SecurityConfig` with stateless JWT token issuance and validation on every request
- [ ] **Email notifications**: notify assignees on row assignment; notify owners on status change
- [ ] **Audit log**: track who changed what and when on test design rows

---

## Backend Guidelines
- Spring Boot layered architecture: Controller → Service → Repository
- DTOs for all API input/output — never expose JPA entities directly from controllers
- Centralised exception handling via `@RestControllerAdvice`
- Use `Pageable` for all list endpoints
- Role/permission checks inside service methods, never in controllers
- `@Transactional(readOnly = true)` on service class, `@Transactional` override on write methods

## Frontend Guidelines
- React functional components with TypeScript
- All API calls via `axios` instances in `src/api/` — one file per backend controller
- Server state via TanStack Query (`useQuery`, `useMutation`)
- Tailwind CSS for all styling — no custom CSS files
- Lucide React for icons; Recharts for charts; `xlsx` for Excel export
- Pages go in `src/pages/`, shared components in `src/components/`
