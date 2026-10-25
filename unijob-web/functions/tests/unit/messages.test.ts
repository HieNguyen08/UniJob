import { describe, expect, it } from 'vitest';
import { clip, messages, safeText, safeTitle } from '../../src/lib/messages.js';

describe('clip', () => {
  it('keeps short text unchanged', () => {
    expect(clip('Nhập liệu', 120)).toBe('Nhập liệu');
  });
  it('clips by characters (not UTF-16 units) and ends with an ellipsis', () => {
    const long = '😀'.repeat(200);
    const out = clip(long, 120);
    expect(Array.from(out)).toHaveLength(120);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('messages (byte-identical to the web client texts)', () => {
  it.each([
    [messages.newApplication('Carol', 'Nhập liệu'), 'Carol đã ứng tuyển "Nhập liệu"'],
    [messages.applicationAccepted('Nhập liệu'), '🎉 Đơn ứng tuyển "Nhập liệu" đã được chấp nhận!'],
    [messages.applicationRejected('Nhập liệu'), 'Đơn ứng tuyển "Nhập liệu" không được chấp nhận'],
    [messages.completionRequested('Nhập liệu'), '📋 Người làm đã báo cáo hoàn thành "Nhập liệu". Vui lòng kiểm tra và xác nhận.'],
    [messages.jobCompletedWorker('Nhập liệu'), '🎉 Công việc "Nhập liệu" đã hoàn thành! Hãy để lại đánh giá.'],
    [messages.jobCompletedPoster('Nhập liệu'), '✅ Công việc "Nhập liệu" đã được xác nhận hoàn thành.'],
    [messages.jobCancelledByPoster('Nhập liệu'), 'Công việc "Nhập liệu" đã bị người đăng hủy.'],
    [messages.deadlineExpired('Nhập liệu'), '⏰ Công việc "Nhập liệu" đã hết hạn và được đóng tự động.'],
    [messages.jobExpiredWorker('Nhập liệu'), '⏰ Công việc "Nhập liệu" đã hết hạn và được đóng tự động.'],
    [messages.jobInvite('Alice', 'Nhập liệu'), 'Alice mời bạn ứng tuyển "Nhập liệu"'],
  ])('%s', (actual, expected) => {
    expect(actual).toBe(expected);
  });

  it('clips a hostile title to 120 characters and a name to 100', () => {
    const msg = messages.newApplication('n'.repeat(500), 't'.repeat(5000));
    expect(msg).toBe(`${'n'.repeat(99)}… đã ứng tuyển "${'t'.repeat(119)}…"`);
  });
});

describe('safeText (user text inside server-signed notifications)', () => {
  it.each([
    ['Nhập liệu', 'Nhập liệu'],
    ['Dọn phòng ở TP.HCM, 1.500.000đ, v.v.', 'Dọn phòng ở TP.HCM, 1.500.000đ, v.v.'],
    ['Ths.Nguyễn cần trợ giảng', 'Ths.Nguyễn cần trợ giảng'],
    ['Gia sư 🎉👨‍👩‍👧 Toán 12', 'Gia sư 🎉👨‍👩‍👧 Toán 12'],
    ['"Trích dẫn" — 100% (gấp)!', '"Trích dẫn" — 100% (gấp)!'],
  ])('keeps ordinary Vietnamese text and emoji: %s', (input, expected) => {
    expect(safeText(input)).toBe(expected);
  });

  it.each([
    ['Việc nhẹ https://evil.example/login?x=1 lương cao', 'Việc nhẹ [liên kết] lương cao'],
    ['Xem HTTP://EVIL.COM ngay', 'Xem [liên kết] ngay'],
    ['Vào www.evil-site.vn để nhận', 'Vào [liên kết] để nhận'],
    ['Đăng ký tại abc.xyz/form', 'Đăng ký tại [liên kết]'],
    ['Nhắn zalo.me/0901234567', 'Nhắn [liên kết]'],
    ['Liên hệ hcmut-support.com ngay', 'Liên hệ [liên kết] ngay'],
    ['Mở (bit.ly/abc) nhé', 'Mở [liên kết] nhé'],
    ['Gửi về a@gmail.com', 'Gửi về [liên kết]'],
    ['Trang evil.com.vn.', 'Trang [liên kết]'],
    ['IP 10.0.0.1/admin', 'IP [liên kết]'],
  ])('replaces links: %s', (input, expected) => {
    expect(safeText(input)).toBe(expected);
  });

  it('strips control and invisible formatting characters, also when they hide a link', () => {
    expect(safeText('Dòng 1\nDòng 2\tA\u0000B\u007F')).toBe('Dòng 1 Dòng 2 A B ');
    expect(safeText('evil\u200B.com')).toBe('[liên kết]');
    expect(safeText('\u202ENhập\u202C liệu')).toBe('Nhập liệu');
    expect(safeText('a\uFEFFb\u2066c\u2069')).toBe('abc');
  });

  it('is linear on hostile input (no catastrophic backtracking)', () => {
    const hostile = 'a-'.repeat(50_000) + '.' + 'b.'.repeat(50_000);
    const started = Date.now();
    safeText(hostile);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('messages neutralise links in titles and names', () => {
    expect(messages.jobInvite('Admin www.evil.vn', 'Nhận quà tại evil.com')).toBe('Admin [liên kết] mời bạn ứng tuyển "Nhận quà tại [liên kết]"');
  });
});

describe('safeTitle', () => {
  it('sanitises and clips like notification titles', () => {
    expect(safeTitle('Xem www.evil.com\nngay')).toBe('Xem [liên kết] ngay');
    expect(Array.from(safeTitle('t'.repeat(5000)))).toHaveLength(120);
  });
});

it('paymentDisputed', () => {
  expect(messages.paymentDisputed('Nhập liệu')).toBe(
    '⚠️ Thanh toán ký quỹ cho "Nhập liệu" đang bị tranh chấp. Tiền sẽ được giữ lại cho đến khi xử lý xong.',
  );
});
