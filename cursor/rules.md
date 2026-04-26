# OnePortal — Cursor AI Rules

Always read `cursor/instructions.md` first to understand the current project state and roadmap before making any changes.

---

## Project Identity

- **Backend:** Spring Boot 3.2, Java 17, Maven, JPA/Hibernate, H2 (dev) / PostgreSQL (prod), Flyway, Apache POI, Lombok, Springdoc OpenAPI
- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS 4, TanStack Query v5, Axios, Recharts, xlsx, Lucide React
- **Main UI flow:** the project UI uses `TestDesignRow` (Excel rows) for test case management — NOT the `TestCase` / `TestExecution` JPA entities

---

## Backend Rules

### Package Structure

```
com.anirudh.testmanagement.oneportal
├── controller/     ← thin HTTP layer only
├── service/        ← business logic, role checks, transactions
├── repository/     ← Spring Data JPA interfaces
├── entity/         ← JPA entities + inner enums
├── dto/            ← all API request/response shapes
├── exception/      ← ResourceNotFoundException, custom handlers
└── config/         ← SecurityConfig, JPA auditing, CORS
```

Every new feature needs: Entity → Repository → Service → Controller → DTO.

### Entities

```java
@Entity
@Table(name = "table_name")
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MyEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // audit
    @CreatedDate @Column(updatable = false) private LocalDateTime createdAt;
    @LastModifiedDate private LocalDateTime updatedAt;
}
```

- Define enums as inner classes of the entity they belong to
- Use `@ManyToOne(fetch = FetchType.LAZY)` for associations; avoid `EAGER`
- Use `@Builder.Default` when initialising collections in Lombok builders

### DTOs

- Group related DTOs as inner static classes inside one outer DTO class (e.g. `TestDesignDTO.RowWithMeta`)
- Use `@Value @Builder` for immutable response DTOs
- For request DTOs that Jackson must deserialise, prefer `@Data` or plain fields with getters — `@Value` alone can cause deserialisation issues without `@JsonCreator`
- Never expose JPA entities directly from controllers

### Services

```java
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)          // class-level default
public class MyService {

    @Transactional                        // override for writes
    public Dto create(...) { ... }
}
```

- All role/permission checks go in the service, not the controller
- Throw `ResourceNotFoundException` for missing entities
- Throw `AccessDeniedException` (Spring Security) for unauthorised actions
- When deleting a parent entity, manually delete children that lack cascade (e.g. `TestDesignRow` before `TestDesignSheet` before `Project`)

### Controllers

```java
@RestController
@RequestMapping("/api/v1/resource")
@RequiredArgsConstructor
@Tag(name = "...", description = "...")
public class MyController {

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Dto.Response create(@RequestBody Dto.CreateRequest req,
                               @RequestParam Long requesterId) { ... }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

- Keep controllers thin: validate input, delegate to service, return DTO
- Use `@RequestParam` for simple query params; `@RequestBody` for JSON bodies
- Return `ResponseEntity<Void>` + `noContent()` for all delete operations
- Annotate every endpoint with `@Operation(summary = "...")` for Swagger

### Security

- Current setup: all routes are `permitAll()` in `SecurityConfig`
- Do not add `@PreAuthorize` or method security without first updating `SecurityConfig`
- When JWT authentication is added (Phase 2), the pattern will change — do not pre-empt it

---

## Frontend Rules

### File Locations

| What | Where |
|------|-------|
| Full-page components | `frontend/src/pages/` |
| Shared/reusable components | `frontend/src/components/` |
| API call functions | `frontend/src/api/` (one file per backend controller) |
| TypeScript interfaces | `frontend/src/types/` |
| React context | `frontend/src/context/` |

### API Layer (`src/api/`)

- Each file exports plain `async` functions — no hooks in API files
- Use a local `axios` instance with `baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'`
- TypeScript return types must match backend DTO shapes defined in `src/types/`

### Data Fetching Pattern

```tsx
// Read
const { data, isLoading, isError } = useQuery({
  queryKey: ['entity', id],
  queryFn: () => getEntity(id),
  enabled: !!id,
});

// Write
const mutation = useMutation({
  mutationFn: (payload) => createEntity(payload),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entity'] }),
  onError: (err: Error) => alert(err.message),
});
```

- Always `invalidateQueries` after mutations to keep UI in sync
- Use `retry: false` on queries that are expected to 404 (e.g. `getSheetByProject` when no sheet exists)

### Routing

Routes are defined in `frontend/src/App.tsx`. All app routes are inside `ProtectedRoute` + `AppLayout`. Add new routes there.

```tsx
<Route path="/projects/:projectId/new-feature" element={<NewFeaturePage />} />
```

### Role Check Pattern

```tsx
const myMembership = members.find((m: ProjectMember) => m.userId === currentUser?.id);
const myRole: ProjectRole | null = myMembership?.role ?? null;
const isOwner = myRole === 'OWNER';
const isTesterOrOwner = myRole === 'OWNER' || myRole === 'TESTER';
```

### Styling Conventions

- **Tailwind only** — never add `style={{}}` props except for dynamic chart fill colours
- **Brand colour:** indigo (`indigo-600` primary, `indigo-100` light background)
- **Cards:** `bg-white rounded-xl border border-gray-200 p-5`
- **Primary button:** `bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg`
- **Danger button:** `bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg`
- **Warning/amber:** `bg-amber-50 text-amber-700 border border-amber-300` (e.g. Replace button)
- **Loading spinner:** `animate-spin` SVG with the project's standard circle/path pattern

### Icons

- **Lucide React only** — no other icon libraries
- Size conventions: `w-4 h-4` in buttons/inline, `w-5 h-5` in card headers, `w-10 h-10` for empty state illustrations

### Charts (Recharts)

- `PieChart` for status distributions; `BarChart` (stacked) for assignment overviews
- Always wrap in `<ResponsiveContainer width="100%" height={260}>`
- Write custom tooltip components above the page function (not inline lambdas)
- Do not hardcode colours inline — use the `STATUS_CHART_COLORS` record pattern

### Pagination Pattern

```tsx
// Helper (define once, reuse)
function getPaginationRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const delta = 2;
  const rangeStart = Math.max(1, current - delta);
  const rangeEnd = Math.min(total - 2, current + delta);
  const result: (number | '...')[] = [0];
  if (rangeStart > 1) result.push('...');
  for (let i = rangeStart; i <= rangeEnd; i++) result.push(i);
  if (rangeEnd < total - 2) result.push('...');
  result.push(total - 1);
  return result;
}

// Page size state
const [pageSize, setPageSize] = useState(25);
// Dropdown options: [10, 25, 50, 100]
```

### Confirmation Modals

Any destructive action (delete row, delete project, delete sheet) must show a confirmation overlay before executing:

```tsx
{deleteTarget && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm mx-4">
      ...Cancel / Confirm buttons...
    </div>
  </div>
)}
```

---

## What NOT to Do

- Do not expose JPA entities directly from controller methods — always use DTOs
- Do not call `/api/v1/test-cases` or `/api/v1/test-executions` in the project test-case flow — the UI uses `TestDesignRow` via `/api/v1/excel/...`
- Do not add new chart libraries (Recharts is the only chart library)
- Do not add new icon libraries (Lucide React only)
- Do not write custom CSS files — use Tailwind utilities exclusively
- Do not change `SecurityConfig` permit-all setup without a plan for JWT (Phase 2)
- Do not use `&&` as a command separator in PowerShell — use `;` or separate shell calls
- Do not introduce `useEffect` for data that can be derived with `useMemo`

---

## Starting a New Feature Checklist

1. Read `cursor/instructions.md` to verify alignment with current architecture
2. Backend: Entity → Flyway migration script → Repository → Service (with role checks) → Controller → DTO
3. Frontend: Add type in `src/types/` → Add API function in `src/api/` → Create page in `src/pages/` → Register route in `App.tsx`
4. Test with dev profile (H2): `mvn spring-boot:run "-Dspring-boot.run.profiles=dev"`
5. Start frontend: `npm run dev` (from `frontend/` directory)
6. Update `cursor/instructions.md` — add the feature to "Built Features" and remove from roadmap
