# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/).

## [Unreleased]

### Added
- Quy trình phát triển bằng đội agent: `/uj-brainstorm`, `/uj-plan`, `/uj-build`, `/uj-ship`, `/uj-status`.
- CI local `scripts/ci-local.mjs` và GitHub Actions: typecheck, lint, unit test + coverage, test Firestore rules trên emulator, build, bundle budget, npm audit, secret scan.
- Hook chặn commit/push khi CI chưa xanh, chặn trailer Co-Authored-By, chặn ghi file bí mật.
- Khung Cloud Functions (`unijob-web/functions`, Node 22, region `asia-southeast1`, database `kirigitejkf8095h`): helper xác thực/thành viên, ghi thông báo idempotent phía server, công thức phí nền tảng dùng chung, callable `ping`; CI chạy typecheck và test functions trên emulator.

### Changed
- Nâng Vite lên 8.3 (bản stable), vá các lỗ hổng high/critical từ `npm audit`, dọn lỗi ESLint.

### Fixed
- Ứng tuyển giờ lưu người ứng tuyển vào job, nên không ứng tuyển trùng được nữa. Chấp nhận ứng viên giờ gán người làm và chuyển job sang "đang làm". Cả hai thao tác ghi nguyên tử.

### Security
- Siết Firestore rules cho jobs, applications, notifications, ratings: không tạo job dưới tên người khác, không sửa danh sách ứng viên của người khác, mỗi người một đơn cho mỗi job, không tự chấp nhận đơn của mình, chỉ đánh giá sau khi hoàn thành và giữa người đăng với người làm. Trước khi deploy rules cần chạy `unijob-web/scripts/migrate-applications.mjs`.
- Siết chuyển trạng thái job của người đăng (không mở lại job về "open", chỉ chuyển sang "đang làm" khi giao việc, chỉ duyệt đơn khi job còn "open") và làm cứng script migrate đơn ứng tuyển cũ (chỉ giữ các trường hợp lệ, kiểm tra như rules, không tự ứng tuyển, chỉ chuyển đơn `accepted` khi người đó được giao việc).
- Thêm npm override `@grpc/grpc-js` `^1.14.5`: firebase đang ghim `~1.9` (có lỗ hổng mức high). Gỡ override khi firebase cập nhật.
- Nâng cấp phụ thuộc để đóng các cảnh báo Dependabot/npm audit: firebase-admin 14.5, firebase-tools 15.34, react-router 7.18, vite/vitest cập nhật bản vá; thêm override `chokidar` `^4.0.3` và `gaxios>uuid` `^11.1.1` (cho firebase-tools); `npm audit` còn 0 high/critical (3 moderate dev-only qua firebase-tools).
- Hook guard-commit chặn commit/push nằm chung một lệnh với thao tác có thể sửa file (sed, redirect, substitution, tùy chọn git chạy được code), và chỉ cho phép một danh sách tùy chọn/biến môi trường an toàn trên chính lệnh commit/push.
