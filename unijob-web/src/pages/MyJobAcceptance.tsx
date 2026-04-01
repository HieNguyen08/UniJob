import { AlertTriangle, CheckCircle2, ChevronLeft, Clock3, Download, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './my-job-acceptance.css';

export default function MyJobAcceptance() {
  const navigate = useNavigate();

  return (
    <div className="accept-page">
      <div className="accept-shell">
        <button className="accept-back-link" type="button" onClick={() => navigate('/my-jobs')}>
          <ChevronLeft className="h-4 w-4" />
          Quay lại trang công việc của tôi
        </button>
        <h1 className="accept-page-title">Xác nhận đã làm xong</h1>

        <section className="accept-card">
          <div className="accept-header-row">
            <div>
              <h2 className="accept-job-title">Hỗ trợ nhập liệu Excel luận văn</h2>
              <p className="accept-job-id">Mã công việc: #JOB2026-1024</p>
            </div>
            <span className="accept-pill">Chờ xác nhận nghiệm thu</span>
          </div>

          <div className="accept-timeline-wrap">
            <div className="accept-timeline-line" />
            <div className="accept-steps">
              <div className="accept-step done">
                <div className="accept-step-icon"><CheckCircle2 className="h-4 w-4" /></div>
                <p>Đã nhận việc</p>
                <small>10/02/2026</small>
              </div>
              <div className="accept-step done">
                <div className="accept-step-icon"><CheckCircle2 className="h-4 w-4" /></div>
                <p>Sinh viên báo hoàn thành</p>
                <small>16/02/2026</small>
              </div>
              <div className="accept-step active">
                <div className="accept-step-icon"><Clock3 className="h-4 w-4" /></div>
                <p>Người đăng xác nhận</p>
                <small>Đang chờ bạn</small>
              </div>
              <div className="accept-step muted">
                <div className="accept-step-icon">4</div>
                <p>Thanh toán & Đánh giá</p>
                <small>Chờ xử lý</small>
              </div>
            </div>
          </div>

          <div className="accept-result-wrap">
            <p className="accept-section-title">Kết quả công việc từ sinh viên</p>
            <div className="accept-user-row">
              <div className="accept-user-avatar">NV</div>
              <div>
                <p className="accept-user-name">Nguyễn Văn An</p>
                <p className="accept-user-msg">Em đã hoàn thành file dữ liệu, anh kiểm tra giúp em nhé.</p>
              </div>
              <span className="accept-user-time">17/02/2026 09:24</span>
            </div>

            <div className="accept-file-box">
              <div>
                <p className="accept-file-name">Ket_qua_final.xlsx</p>
                <p className="accept-file-size">2.4 MB</p>
              </div>
              <button type="button" className="accept-download-btn">
                <Download className="h-4 w-4" />
                Tải xuống
              </button>
            </div>
          </div>

          <div className="accept-warning-box">
            <div className="accept-warning-title-row">
              <AlertTriangle className="h-4 w-4" />
              <h3>Xác nhận nghiệm thu công việc</h3>
            </div>
            <p>Vui lòng kiểm tra kỹ kết quả trước khi xác nhận. Sau khi xác nhận sẽ không được hoàn tác.</p>

            <div className="accept-warning-actions">
              <button type="button" className="accept-confirm-btn">Xác nhận: Đã nhận kết quả</button>
              <button type="button" className="accept-report-btn">Báo cáo sự cố</button>
            </div>

            <p className="accept-warning-note">Hệ thống sẽ chuyển tiền cho sinh viên và mở tính năng đánh giá</p>
          </div>

          <section className="accept-footer">
            <p className="accept-footer-note">Lưu ý: Để tránh tranh chấp, vui lòng kiểm tra kỹ file kết quả trước khi xác nhận. Mọi hành vi xác nhận không sẽ bị trừ điểm uy tín và có thể dẫn đến khóa tài khoản vĩnh viễn.</p>
            <div className="accept-footer-grid">
              <div>
                <p>Thù lao</p>
                <strong>500,000 VNĐ</strong>
              </div>
              <div>
                <p>Thời hạn</p>
                <strong>20/02/2026</strong>
              </div>
              <div>
                <p>Sinh viên</p>
                <strong>Nguyễn Văn An</strong>
              </div>
            </div>
          </section>
        </section>

        <button onClick={() => navigate('/my-jobs')} className="accept-help-link" type="button">
          <Phone className="h-4 w-4" />
          Cần hỗ trợ? Liên hệ bộ phận hỗ trợ
        </button>
      </div>
    </div>
  );
}
