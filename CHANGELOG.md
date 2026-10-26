# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/).

## [Unreleased]

### Added
- Quy trình phát triển bằng đội agent: `/uj-brainstorm`, `/uj-plan`, `/uj-build`, `/uj-ship`, `/uj-status`.
- CI local `scripts/ci-local.mjs` và GitHub Actions: typecheck, lint, unit test + coverage, test Firestore rules trên emulator, build, bundle budget, npm audit, secret scan.
- Hook chặn commit/push khi CI chưa xanh, chặn trailer Co-Authored-By, chặn ghi file bí mật.
- Khung Cloud Functions (`unijob-web/functions`, Node 22, region `asia-southeast1`, database `kirigitejkf8095h`): helper xác thực/thành viên, ghi thông báo idempotent phía server, công thức phí nền tảng dùng chung, callable `ping`; CI chạy typecheck và test functions trên emulator.
- Thông báo phía server: trigger Firestore gửi thông báo khi có đơn ứng tuyển mới, đơn được chấp nhận/từ chối, người làm báo hoàn thành, job bị hủy hoặc hoàn thành; hàm định kỳ (30 phút, giờ Việt Nam) đóng job quá hạn sau khi hết ngày hạn chót; callable `sendJobInvite` cho lời mời. Tên người gửi lấy từ tài khoản Google HCMUT đã xác minh, liên kết trong tiêu đề/tên bị thay bằng "[liên kết]".
- Ký quỹ phía server: khi job chuyển từ "open" sang "đang làm" (người đăng chấp nhận ứng viên), Cloud Function tạo bản ghi ký quỹ `payments/{jobId}_{người làm}` (chỉ là sổ ghi, chưa chuyển tiền thật) và giải ngân khi job hoàn thành. Người đăng hoặc người làm có thể "Báo tranh chấp" trên trang thanh toán (callable `disputePayment`, lý do 10–500 ký tự); bên kia nhận thông báo.
- Xác nhận hoàn thành phía server: người làm "Báo hoàn thành" và người đăng "Xác nhận" qua callable `confirmCompletion`. Khi cả hai đã xác nhận, server chuyển job sang "đã hoàn thành", ghi lịch sử làm việc và giải ngân ký quỹ. Người làm xác nhận sau cùng giờ cũng hoàn tất được job.

### Changed
- Nâng Vite lên 8.3 (bản stable), vá các lỗ hổng high/critical từ `npm audit`, dọn lỗi ESLint.

### Fixed
- Ứng tuyển giờ lưu người ứng tuyển vào job, nên không ứng tuyển trùng được nữa. Chấp nhận ứng viên giờ gán người làm và chuyển job sang "đang làm". Cả hai thao tác ghi nguyên tử.
- Người làm hủy việc giờ hoạt động (trước đây bị rules chặn): server mở lại job để tìm người khác, trừ điểm uy tín theo thời gian còn lại đến hạn chót và báo cho người đăng. Điểm trung bình đánh giá giờ được server cập nhật sau mỗi đánh giá.

### Security
- Client không còn tự ghi điểm uy tín, số đánh giá, điểm phạt, số job đang làm/đã hoàn thành, giới hạn nhận việc, xp/level/huy hiệu/role trên hồ sơ (rules chặn, kể cả khi tạo hồ sơ lần đầu). Người đăng không tự hủy job đang làm được nữa: mọi lần hủy đi qua callable `cancelJob` (phạt, hoàn ký quỹ, chặn hủy khi người làm đã báo hoàn thành). Deploy functions trước, rồi rules và hosting cùng lúc.
- Client không còn tạo/sửa `jobCompletions`, ghi `workHistory` hay tự chuyển job sang "đã hoàn thành" (rules chặn), nên người đăng không tự mở khoá đánh giá được nữa. Deploy functions trước, rồi rules và hosting cùng lúc.
- Client không còn tạo, giải ngân, hoàn tiền hay đánh dấu tranh chấp thanh toán (rules chặn mọi ghi vào `payments` và `jobs.paymentStatus`). Trang thanh toán đọc theo id của server; giao dịch cũ (id ngẫu nhiên) vẫn xem được nhưng cần quản trị viên rà soát. Deploy rules trước, rồi functions, rồi hosting.
- Client không còn tự tạo thông báo cho người khác (rules chặn `notifications.create`). Lời mời gửi qua callable `sendJobInvite`. Mỗi job chỉ có một doc hoàn thành (`jobCompletions/{jobId}`), chỉ người đăng và người làm đọc/sửa được và chỉ khi job đang làm. Client không ghi được `cancelReason`, không sửa `createdAt`, `updatedAt` phải là giờ server. Hạn chót lưu `null` (không có hạn) hoặc cuối ngày theo giờ Việt Nam và phải ở tương lai. Trước khi deploy cần chạy migrate đơn ứng tuyển và xử lý doc hoàn thành cũ (xem `docs/backlog/security-holes.md`).
- Siết Firestore rules cho jobs, applications, notifications, ratings: không tạo job dưới tên người khác, không sửa danh sách ứng viên của người khác, mỗi người một đơn cho mỗi job, không tự chấp nhận đơn của mình, chỉ đánh giá sau khi hoàn thành và giữa người đăng với người làm. Trước khi deploy rules cần chạy `unijob-web/scripts/migrate-applications.mjs`.
- Siết chuyển trạng thái job của người đăng (không mở lại job về "open", chỉ chuyển sang "đang làm" khi giao việc, chỉ duyệt đơn khi job còn "open") và làm cứng script migrate đơn ứng tuyển cũ (chỉ giữ các trường hợp lệ, kiểm tra như rules, không tự ứng tuyển, chỉ chuyển đơn `accepted` khi người đó được giao việc).
- Thêm npm override `@grpc/grpc-js` `^1.14.5`: firebase đang ghim `~1.9` (có lỗ hổng mức high). Gỡ override khi firebase cập nhật.
- Nâng cấp phụ thuộc để đóng các cảnh báo Dependabot/npm audit: firebase-admin 14.5, firebase-tools 15.34, react-router 7.18, vite/vitest cập nhật bản vá; thêm override `chokidar` `^4.0.3` và `gaxios>uuid` `^11.1.1` (cho firebase-tools); `npm audit` còn 0 high/critical (3 moderate dev-only qua firebase-tools).
- Hook guard-commit chặn commit/push nằm chung một lệnh với thao tác có thể sửa file (sed, redirect, substitution, tùy chọn git chạy được code), và chỉ cho phép một danh sách tùy chọn/biến môi trường an toàn trên chính lệnh commit/push.
