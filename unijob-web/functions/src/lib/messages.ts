/**
 * Notification texts. Keep byte-identical to the texts the web client sent before slice 3
 * (job.service.ts, rating.service.ts, cancel.service.ts, cleanup.service.ts, CreateJob.tsx).
 */
const MAX_TITLE = 120;
const MAX_NAME = 100;

/** At most `max` characters (code points, so emoji are never split); clipped text ends with '…'. */
export function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

/** C0/C1 control characters (newlines, tabs, NUL, ...): replaced by a space so words stay apart. */
const isControl = (cp: number) => cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
/**
 * Invisible formatting characters that can hide or reorder text: soft hyphen, Arabic letter mark,
 * zero-width space, LRM/RLM, bidi embeddings/overrides/isolates, word joiner and invisible operators,
 * BOM. ZWNJ/ZWJ (U+200C, U+200D) are kept: emoji sequences need them.
 */
const INVISIBLE = new Set([0xad, 0x61c, 0x200b, 0x200e, 0x200f, 0xfeff]);
const isInvisible = (cp: number) =>
  INVISIBLE.has(cp) || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x2064) || (cp >= 0x2066 && cp <= 0x2069);

function visibleText(text: string): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isControl(cp)) out += ' ';
    else if (!isInvisible(cp)) out += ch;
  }
  return out;
}

const LINK_PLACEHOLDER = '[liên kết]';
// Every pattern runs on one whitespace-free token and has no nested quantifiers: linear time.
const SCHEME_OR_WWW = /https?:\/\/|www\./i;
/** `label.label/`: a host followed by a path (any TLD, also IPs), e.g. abc.xyz/form, 10.0.0.1/admin. */
const HOST_WITH_PATH = /[a-z0-9-]\.[a-z0-9-]+\//i;
/** `label.tld` with a known TLD; the list keeps "TP.HCM" or "Ths.Nguyễn" untouched. */
const HOST_WITH_TLD = /[a-z0-9]\.([a-z]{2,24})(?![a-z0-9-])/gi;
const LINK_TLDS = new Set([
  'com', 'net', 'org', 'info', 'biz', 'edu', 'gov', 'vn', 'io', 'co', 'me', 'ly', 'xyz', 'app', 'dev',
  'site', 'online', 'top', 'link', 'click', 'shop', 'store', 'live', 'gg', 'to', 'cc', 'tk', 'ml', 'ga',
  'cf', 'gq', 'ru', 'cn', 'us', 'uk', 'ai', 'tv', 'pw', 'icu', 'club', 'vip', 'fun', 'asia', 'page', 'ws',
  'sh', 'gl', 'su', 'win', 'bid', 'today', 'work', 'one', 'pro', 'tech', 'space', 'website', 'zip', 'mov',
]);

function looksLikeLink(token: string): boolean {
  if (SCHEME_OR_WWW.test(token) || HOST_WITH_PATH.test(token)) return true;
  for (const match of token.matchAll(HOST_WITH_TLD)) {
    if (LINK_TLDS.has(match[1].toLowerCase())) return true;
  }
  return false;
}

/**
 * User-controlled text (job titles, names) inside a server-signed notification: control and
 * invisible characters are removed, and every whitespace-separated token that looks like a link
 * (http(s)://, www., host/path, host.tld, e-mail address) becomes '[liên kết]'.
 */
export function safeText(text: string): string {
  return visibleText(text)
    .split(/(\s+)/)
    .map((token) => (token.trim() && looksLikeLink(token) ? LINK_PLACEHOLDER : token))
    .join('');
}

/** The transform notification messages apply to job titles; also used for titles stored by the server. */
export const safeTitle = (title: string) => clip(safeText(title), MAX_TITLE);
const t = safeTitle;
const n = (name: string) => clip(safeText(name), MAX_NAME);

export const messages = {
  newApplication: (applicantName: string, title: string) => `${n(applicantName)} đã ứng tuyển "${t(title)}"`,
  applicationAccepted: (title: string) => `🎉 Đơn ứng tuyển "${t(title)}" đã được chấp nhận!`,
  applicationRejected: (title: string) => `Đơn ứng tuyển "${t(title)}" không được chấp nhận`,
  completionRequested: (title: string) =>
    `📋 Người làm đã báo cáo hoàn thành "${t(title)}". Vui lòng kiểm tra và xác nhận.`,
  jobCompletedWorker: (title: string) => `🎉 Công việc "${t(title)}" đã hoàn thành! Hãy để lại đánh giá.`,
  jobCompletedPoster: (title: string) => `✅ Công việc "${t(title)}" đã được xác nhận hoàn thành.`,
  jobCancelledByPoster: (title: string) => `Công việc "${t(title)}" đã bị người đăng hủy.`,
  deadlineExpired: (title: string) => `⏰ Công việc "${t(title)}" đã hết hạn và được đóng tự động.`,
  /** To a worker assigned to a job the scheduler expired: neutral, not "cancelled by the poster". */
  jobExpiredWorker: (title: string) => `⏰ Công việc "${t(title)}" đã hết hạn và được đóng tự động.`,
  paymentDisputed: (title: string) =>
    `⚠️ Thanh toán ký quỹ cho "${t(title)}" đang bị tranh chấp. Tiền sẽ được giữ lại cho đến khi xử lý xong.`,
  jobInvite: (fromName: string, title: string) => `${n(fromName)} mời bạn ứng tuyển "${t(title)}"`,
} as const;
