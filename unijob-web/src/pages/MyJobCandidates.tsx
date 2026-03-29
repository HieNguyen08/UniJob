import { ChevronLeft, FileText, MessageCircle, Star, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './my-job-candidates.css';

type Candidate = {
  id: string;
  name: string;
  faculty: string;
  year: string;
  scoreLabel: string;
  ratingCount: string;
  message: string;
};

const candidates: Candidate[] = [
  {
    id: 'c1',
    name: 'Nguyễn Văn A',
    faculty: 'Khoa KHMT - K2021',
    year: 'K2021',
    scoreLabel: '4.9/5',
    ratingCount: '24 đánh giá',
    message:
      'Chào bạn, mình có 2 năm kinh nghiệm quay dựng video TikTok, từng làm cho CLB Truyền thông trường. Mình có sẵn thiết bị quay chuyên nghiệp và có thể bắt đầu ngay. Mình đã từng thực hiện nhiều dự án tương tự và có portfolio để bạn tham khảo.',
  },
  {
    id: 'c2',
    name: 'Trần Thị B',
    faculty: 'Quản lý công nghiệp - K2020',
    year: 'K2020',
    scoreLabel: '5/5',
    ratingCount: '18 đánh giá',
    message:
      'Em xin chào anh/chị. Em là sinh viên năm 4 chuyên ngành Quản lý công nghiệp, có kinh nghiệm quay dựng video cho nhiều sự kiện của trường và các doanh nghiệp. Em rất hứng thú với công việc này và cam kết hoàn thành tốt nhất.',
  },
  {
    id: 'c3',
    name: 'Lê Minh C',
    faculty: 'Khoa Hóa - K2022',
    year: 'K2022',
    scoreLabel: '4.7/5',
    ratingCount: '12 đánh giá',
    message:
      'Hello! Mình là content creator có kênh TikTok 50K followers. Mình rất am hiểu về xu hướng video viral và biết cách tạo nội dung hấp dẫn. Mình có thể giúp bạn quay video chất lượng cao và tư vấn về concept nếu cần.',
  },
];

export default function MyJobCandidates() {
  const navigate = useNavigate();

  return (
    <div className="candidates-page">
      <div className="candidates-container">
        <button
          onClick={() => navigate('/my-jobs')}
          className="candidates-back-link"
          type="button"
        >
          <ChevronLeft className="h-4 w-4" />
          Quay lại danh sách việc
        </button>

        <h1 className="candidates-title">Danh sách ứng viên</h1>

        <section className="candidates-job-card">
          <p className="candidates-job-title">
            Công việc: <span>Tìm người quay video TikTok sự kiện</span>
          </p>
          <div className="candidates-job-meta">
            <span className="candidates-price">500.000đ</span>
            <span className="candidates-status">Đang tìm người (3 ứng viên)</span>
          </div>
        </section>

        <div className="candidates-list">
          {candidates.map((candidate) => (
            <article key={candidate.id} className="candidate-card">
              <div className="candidate-left">
                <div className="candidate-avatar-wrap">
                  <div className="candidate-avatar">
                    <UserRound className="h-10 w-10" />
                  </div>
                </div>
                <h3 className="candidate-name">{candidate.name}</h3>
                <p className="candidate-faculty">{candidate.faculty}</p>
                <div className="candidate-rating">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span className="candidate-rating-score">{candidate.scoreLabel}</span>
                  <span className="candidate-rating-count">({candidate.ratingCount})</span>
                </div>
              </div>

              <div className="candidate-message-col">
                <p className="candidate-message-label">Lời nhắn / Cover Letter:</p>
                <p className="candidate-message">{candidate.message}</p>
              </div>

              <div className="candidate-actions">
                <button className="candidate-btn candidate-btn-accept" type="button">
                  Chấp nhận
                </button>
                <button className="candidate-btn candidate-btn-reject" type="button">
                  Từ chối
                </button>

                <button className="candidate-link" type="button">
                  <FileText className="h-4 w-4" />
                  Xem hồ sơ chi tiết
                </button>
                <button className="candidate-link" type="button">
                  <MessageCircle className="h-4 w-4" />
                  Nhắn tin
                </button>
                </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
