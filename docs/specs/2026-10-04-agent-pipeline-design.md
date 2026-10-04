---
title: UniJob Agent Pipeline — Design
status: draft
date: 2026-10-04
owner: HieNguyen08
sub-project: A (agent team + pipeline). Sub-project B (product upgrade) is designed later through this pipeline.
---

# UniJob Agent Pipeline — Design

## 1. Bối cảnh và mục tiêu

UniJob (`unijob-web/`, React 19 + TS + Vite 8 + Tailwind v4 + Firebase) sẽ trở thành **sản phẩm thật cho trường**. Hiện project chưa có test, chưa có CI, chưa có `CLAUDE.md`, và `.claude/` đang bị gitignore. Firestore rules có những lỗ hổng nghiêm trọng: payee có thể tự `release` payment, ai cũng update được `jobCompletions`, ai cũng tạo được `notifications` cho người khác, và chưa có `storage.rules`.

Mục tiêu: dựng một **đội agent cố định trong repo** để mọi thay đổi đi qua cùng một quy trình:

```
brainstorm → spec ⛔ → plan ⛔ → dev ⇄ review/security ⇄ fix → CI local → commit/push/PR ⛔
```

Đầu ra được commit vào repo để cả team clone về là dùng được.

### Quyết định đã chốt
| Chủ đề | Quyết định |
|---|---|
| Mức production | Sản phẩm thật cho trường |
| Cửa duyệt của người | 3 cửa: duyệt spec, duyệt plan, trước khi push/mở PR |
| Deploy/backend (dùng cho B) | Firebase full: Hosting + Cloud Functions (Blaze) + Emulator Suite |
| Hướng dựng pipeline | Agent riêng của project + Workflow script điều phối, commit vào repo |
| Luật commit | **Không bao giờ** thêm trailer `Co-Authored-By`; không thêm footer "Generated with Claude Code" vào PR |
| Luật PR | Mọi PR tạo bằng `gh pr create --assignee @me` (assign HieNguyen08) |

### Ngoài phạm vi
- Mọi thay đổi sản phẩm như Functions, escrow trên server, UI mới hay feature mới thuộc sub-project B. Ngoại lệ: nền test tối thiểu (mục 5) và dry run (mục 8).
- Đóng gói thành plugin dùng chung nhiều repo (YAGNI; làm sau nếu cần).

## 2. Vai trò agent

Định nghĩa trong `.claude/agents/<name>.md`. Reviewer và auditor **chỉ đọc**, chỉ implementer được sửa code. Agent nào gặp việc vượt phạm vi plan thì dừng và báo cáo, không tự mở rộng.

| Agent | Trách nhiệm | Công cụ | Skill/agent tái dùng | Model |
|---|---|---|---|---|
| `product-strategist` | Làm rõ ý tưởng, viết spec, đối chiếu mục tiêu sản phẩm thật | Read, Glob, Grep, Write (chỉ `docs/specs/`) | superpowers:brainstorming | opus |
| `architect-planner` | Chia spec thành task nhỏ (file, test, lệnh verify cụ thể) | Read, Glob, Grep, Write (chỉ `docs/plans/`) | superpowers:writing-plans, feature-dev:code-architect | opus |
| `implementer` | Code một task theo TDD trong worktree, chạy `ci-local --quick`, commit checkpoint | Read, Edit, Write, Bash, Glob, Grep | superpowers:test-driven-development, systematic-debugging | sonnet |
| `code-reviewer` | Tìm bug/logic/regression; chỉ báo finding có file:line và cách tái hiện | Read, Glob, Grep, Bash (git diff, chỉ đọc) | pr-review-toolkit, feature-dev:code-reviewer | opus |
| `security-auditor` | Rules Firestore/Storage, Functions, auth, input validation, secrets, XSS | Read, Glob, Grep, Bash (chỉ đọc) | checklist Firebase (mục 2.1) | opus |
| `ci-runner` | Chạy `ci-local`, tóm tắt nguyên nhân lỗi; **không sửa code** | Read, Bash | systematic-debugging | haiku |
| `release-manager` | Gộp commit, chạy CI full, push, mở PR, cập nhật CHANGELOG | Read, Bash, Edit (CHANGELOG) | commit-commands, finishing-a-development-branch | sonnet |

### 2.1 Checklist của security-auditor (Firebase)
- Mọi `match` trong `firestore.rules`/`storage.rules` đều có test cho cả allow và deny.
- Client không được tự ghi các field "đáng tin": `amount`, `status` của payment, `postedBy`, `role`, điểm uy tín/XP, `completedAt`. Những field này phải do Functions/Admin SDK ghi.
- Callable/HTTP Functions kiểm `auth`, validate input bằng schema, và idempotent với thao tác tiền.
- Không có secret trong code hoặc bundle (`VITE_*` là public). Không có `dangerouslySetInnerHTML` với dữ liệu người dùng. Upload kiểm content-type và kích thước.

## 3. Luồng lệnh và bàn giao

Các agent bàn giao qua **file trong repo**, không qua trí nhớ hội thoại:

| Lệnh | Agent | Đầu ra | Dừng |
|---|---|---|---|
| `/uj-brainstorm <ý tưởng>` | product-strategist | `docs/specs/YYYY-MM-DD-<topic>.md` (`status: draft`) | ⛔ Cửa 1: người duyệt, `status: approved` |
| `/uj-plan <spec>` | architect-planner | `docs/plans/YYYY-MM-DD-<topic>.md`, task dạng `### Task N: …` | ⛔ Cửa 2: người duyệt, `status: approved` |
| `/uj-build <plan> [--resume]` | Workflow `uj-build` | commit trên `feat/<topic>` + `docs/runs/YYYY-MM-DD-<topic>.md` | tự chạy; dừng nếu `blocked`/`needs-human` |
| `/uj-ship` | release-manager | push + PR (assign @me) | ⛔ Cửa 3: người xem tóm tắt trước khi push |
| `/uj-status` | (session chính) | stage hiện tại, worktree, run id, CI gần nhất | — |

Lệnh nào gặp đầu vào chưa `approved` thì từ chối chạy.

## 4. Vòng lặp `/uj-build`

### 4.1 Chuẩn bị (session chính, trước Workflow)
1. Kiểm tra plan có `status: approved` và working tree sạch.
2. `git worktree add .worktrees/<topic> -b feat/<topic> main`, rồi chạy `npm ci` trong `unijob-web/` của worktree.
3. Đọc danh sách task từ plan và gọi Workflow `uj-build` với `args = {worktree, plan, tasks:[{id,title}], maxRounds: 3, runDate}`.

### 4.2 Workflow `.claude/workflows/uj-build.js`
Workflow script không truy cập được filesystem. Mọi agent nhận đường dẫn worktree và chỉ thao tác trong đó. Không dùng `isolation: 'worktree'` theo từng agent, vì mỗi lần như vậy tạo worktree mới và mất nhánh chung.

```
for task in tasks (tuần tự):
  implementer(task)                     → {status: done|blocked, baseSha, headSha, files, summary, blockedReason?}
  if blocked → return {stoppedAt: task, reason}
  round = 0; reviewers = [code-reviewer, security-auditor]
  loop:
    findings = parallel(reviewers on git diff baseSha..HEAD)
    blocking = severity ∈ {critical, high, medium} AND confidence ≥ 80
    nonBlocking → followUps
    if blocking empty → break
    if round == maxRounds → mark needs-human; return
    implementer(fix blocking) → ci-local --quick; round++
    reviewers = những reviewer vừa có finding blocking
final:
  ci-runner(ci-local --full); fail → implementer sửa theo ci/last-run.json (tối đa 2 vòng) → còn đỏ: needs-human
  parallel(code-reviewer, pr-test-analyzer, silent-failure-hunter, security-auditor) trên diff main..HEAD
  blocking → 1 vòng fix + ci full; còn blocking → needs-human
return {tasks:[{id, rounds, fixed, status}], followUps, ci, range}
```

Schema finding:
`{severity: critical|high|medium|low, confidence: 0-100, file, line, issue, suggestedFix, reviewer}`.

- Tối đa 4 agent chạy song song, đúng giới hạn workflow "small" của session.
- Session chính ghi giá trị trả về thành `docs/runs/YYYY-MM-DD-<topic>.md`. **Không bỏ finding một cách im lặng**: mọi finding dưới ngưỡng đều nằm trong mục Follow-ups.
- **Resume:** worktree được giữ nguyên. `/uj-build --resume` gọi lại với `resumeFromRunId`, nên các agent đã xong được lấy từ cache.
- Với mốc lớn (lần đầu lên production, thay đổi payment), `/uj-ship` gợi ý chạy `/claude-security` riêng, vì Workflow chỉ lồng được một cấp.

## 5. CI local: `scripts/ci-local.mjs`

Viết bằng Node nên chạy được trên PowerShell, Git Bash và Ubuntu. Kết quả ghi vào `ci/last-run.json` (`{mode, fingerprint, ok, gates:[{name, ok, summary, files}]}`, trong đó `fingerprint = sha256(HEAD sha + output của git diff HEAD)`, tức trạng thái code mà CI đã thật sự kiểm).

| Gate | `--quick` | `--full` | Điều kiện pass |
|---|---|---|---|
| Typecheck web (và functions khi có) | ✓ | ✓ | 0 lỗi |
| ESLint | file đã đổi | toàn bộ | 0 error |
| Vitest | `vitest related <files> --run` | `vitest run --coverage` | xanh; coverage ≥ 70% lines cho file mới/đổi trong `src/services/**` và `functions/src/**` |
| Test rules (Firestore + Storage) | — | `firebase emulators:exec --only firestore,storage,auth` | xanh |
| Test Functions | — | trên emulator (khi đã có `functions/`) | xanh |
| Build | — | `vite build` | thành công |
| Bundle budget | — | gzip của entry chunk so với `ci/budget.json` | tăng ≤ 10% |
| Dependency audit | — | `npm audit --omit=dev --audit-level=high` | 0 lỗi high/critical |
| Secret scan | — | `gitleaks` qua Docker; không có Docker thì dùng regex | 0 phát hiện |

**Nền test tối thiểu, làm trong A:**
- Vitest + coverage, kèm test cho `calculatePlatformFee`.
- `@firebase/rules-unit-testing` + emulator.
- Bộ test ghi lại hành vi rules **hiện tại**. Các lỗ hổng đã biết được viết thành `it.fails` mô tả hành vi *đúng*, để B lật chúng thành xanh.
- Tạo `ci/budget.json` từ một lần build đo baseline.

**GitHub Actions** (`.github/workflows/ci.yml`): chạy trên ubuntu-latest với Node 24 và Java 21, gọi đúng `node scripts/ci-local.mjs --full`. Trigger: `pull_request` và `push` lên `main`.

## 6. Hooks và quyền (`.claude/settings.json`)

- **`guard-commit.mjs`** (PreToolUse, Bash): chỉ áp dụng cho `git commit` và `git push`.
  - **Chặn** khi message chứa `Co-Authored-By` (không phân biệt hoa thường).
  - **Chặn** khi `ci/last-run.json` thiếu, `ok=false`, hoặc `fingerprint` tính lại không khớp, tức code đã đổi sau lần CI cuối. Commit checkpoint trong worktree được chấp nhận với kết quả `--quick`.
  - **Chặn** `git push` khi lần chạy gần nhất không phải `--full`.
- **`guard-secrets.mjs`** (PreToolUse, Write|Edit): chặn ghi vào `.env*` (trừ `.env*.example`), `**/service-account*.json` và `*.pem`.
- **Allowlist:** `npm ci|run *`, `npx vitest *`, `npx firebase emulators:*`, `node scripts/ci-local.mjs *`, các lệnh git chỉ đọc, `gh pr view|list`.

## 7. Quy ước repo

- **`.gitignore`:** bỏ dòng `.claude/`; thêm `.claude/settings.local.json`, `.worktrees/`, `ci/last-run.json`, `unijob-web/coverage/`.
- **`CLAUDE.md`** (ở root): mô tả project, lệnh dev/CI, cấu trúc thư mục, quy ước, **luật** (không co-author, assign PR, 3 cửa duyệt, chỉ implementer sửa code) và quy trình `/uj-*`.
- **Nhánh:** `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, tách từ `main`.
- **Commit:** Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`), không có `Co-Authored-By`.
- **`/uj-ship`:**
  1. `git reset --soft <base>` rồi tạo 1–n commit có nghĩa.
  2. `ci-local --full`.
  3. Hiện tóm tắt diff và báo cáo run (cửa 3).
  4. `git push -u origin <branch>`.
  5. `gh pr create --base main --assignee @me`, body theo `.github/pull_request_template.md`: Summary, Spec/Plan, bằng chứng CI, Ghi chú security, Follow-ups. Không có footer AI.
- **Dọn dẹp:** sau khi merge, chạy `commit-commands:clean_gone` và `git worktree remove`.

## 8. Kiểm thử pipeline

1. **Kiểm tĩnh**
   - Agent `plugin-dev:plugin-validator` kiểm frontmatter của agent và command.
   - `node --check` cho workflow và hooks.
   - Đưa JSON mẫu vào stdin của hook để chứng minh: chặn commit có `Co-Authored-By`, chặn ghi `.env.local`, cho phép commit sạch khi CI xanh.
   - `ci-local --full` xanh trên nhánh `chore/agent-pipeline`.
2. **Dry run end-to-end** trên task thật nhỏ *"Chặn tạo `notifications` cho user khác + test rules"*, chạy đủ 4 lệnh. Tiêu chí đạt:
   - (a) dừng đúng 3 cửa;
   - (b) vòng review kết thúc trong giới hạn;
   - (c) có `docs/runs/…`;
   - (d) commit không có co-author;
   - (e) PR được assign cho HieNguyen08;
   - (f) GitHub Actions xanh.

## 9. Bootstrap

Sub-project A được làm theo superpowers (spec → writing-plans → subagent-driven-development) trên nhánh `chore/agent-pipeline` và kết thúc bằng một PR assign cho HieNguyen08. Sau khi merge, sub-project B bắt đầu bằng `/uj-brainstorm`.

## 10. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Emulator chậm hoặc lỗi trên Windows | Chỉ chạy ở `--full`; cùng script chạy trên GitHub Actions ubuntu |
| Vòng review không hội tụ (reviewer bắt bẻ mãi) | Ngưỡng confidence ≥ 80, tối đa 3 vòng, sau đó `needs-human` |
| Hook chặn nhầm | Hook in rõ lý do; người có thể sửa `ci/last-run.json` bằng cách chạy lại CI, không tắt hook |
| Chi phí token | Mỗi task ~3–7 agent; implementer và ci-runner dùng model rẻ hơn |
| MCP Firebase/Vercel chưa kết nối | Pipeline chỉ dựa vào CLI (`firebase`, `gh`, `npm`); MCP là tùy chọn |
