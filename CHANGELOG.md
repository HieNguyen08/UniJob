# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/).

## [Unreleased]

### Added
- Quy trình phát triển bằng đội agent: `/uj-brainstorm`, `/uj-plan`, `/uj-build`, `/uj-ship`, `/uj-status`.
- CI local `scripts/ci-local.mjs` và GitHub Actions: typecheck, lint, unit test + coverage, test Firestore rules trên emulator, build, bundle budget, npm audit, secret scan.
- Hook chặn commit/push khi CI chưa xanh, chặn trailer Co-Authored-By, chặn ghi file bí mật.

### Changed
- Nâng Vite lên 8.3 (bản stable), vá các lỗ hổng high/critical từ `npm audit`, dọn lỗi ESLint.

### Fixed
- Ứng tuyển giờ lưu người ứng tuyển vào job, nên không ứng tuyển trùng được nữa. Chấp nhận ứng viên giờ gán người làm và chuyển job sang "đang làm". Cả hai thao tác ghi nguyên tử.

### Security
- Siết Firestore rules cho jobs, applications, notifications, ratings: không tạo job dưới tên người khác, không sửa danh sách ứng viên của người khác, mỗi người một đơn cho mỗi job, không tự chấp nhận đơn của mình, chỉ đánh giá sau khi hoàn thành và giữa người đăng với người làm. Trước khi deploy rules cần chạy `unijob-web/scripts/migrate-applications.mjs`.
- Thêm npm override `@grpc/grpc-js` `^1.14.5`: firebase đang ghim `~1.9` (có lỗ hổng mức high). Gỡ override khi firebase cập nhật.
- Nâng cấp phụ thuộc để đóng các cảnh báo Dependabot/npm audit: firebase-admin 14.5, firebase-tools 15.34, react-router 7.18, vite/vitest cập nhật bản vá; thêm override `chokidar` `^4.0.3` và `gaxios>uuid` `^11.1.1` (cho firebase-tools); `npm audit` còn 0 high/critical (3 moderate dev-only qua firebase-tools).
