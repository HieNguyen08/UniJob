# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/).

## [Unreleased]

### Added
- Quy trình phát triển bằng đội agent: `/uj-brainstorm`, `/uj-plan`, `/uj-build`, `/uj-ship`, `/uj-status`.
- CI local `scripts/ci-local.mjs` và GitHub Actions: typecheck, lint, unit test + coverage, test Firestore rules trên emulator, build, bundle budget, npm audit, secret scan.
- Hook chặn commit/push khi CI chưa xanh, chặn trailer Co-Authored-By, chặn ghi file bí mật.

### Changed
- Nâng Vite lên 8.3 (bản stable), vá các lỗ hổng high/critical từ `npm audit`, dọn lỗi ESLint.

### Security
- Thêm npm override `@grpc/grpc-js` `^1.14.5`: firebase đang ghim `~1.9` (có lỗ hổng mức high). Gỡ override khi firebase cập nhật.
