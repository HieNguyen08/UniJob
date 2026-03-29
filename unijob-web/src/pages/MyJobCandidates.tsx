import { ChevronLeft, FileText, MessageCircle, Star, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-6xl rounded-2xl border border-[var(--color-border)] bg-white p-6 md:p-8">
        <button
          onClick={() => navigate('/my-jobs')}
          className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Quay lại danh sách việc
        </button>

        <h1 className="mt-3 text-5xl font-bold text-slate-900">Danh sách ứng viên</h1>

        <section className="mt-6 rounded-2xl border border-[var(--color-border)] p-4">
          <p className="text-xl text-slate-600">Công việc: <span className="font-semibold text-slate-800">Tìm người quay video TikTok sự kiện</span></p>
          <div className="mt-2 flex items-center gap-3 text-lg">
            <span className="font-bold text-green-500">500.000đ</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500">Đang tìm người (3 ứng viên)</span>
          </div>
        </section>

        <div className="mt-5 space-y-4">
          {candidates.map((candidate) => (
            <article key={candidate.id} className="rounded-2xl border border-[var(--color-border)] p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <UserRound className="h-10 w-10" />
                  </div>

                  <div className="max-w-2xl">
                    <h3 className="text-3xl font-bold text-slate-800">{candidate.name}</h3>
                    <p className="mt-1 text-base text-slate-500">{candidate.faculty}</p>
                    <div className="mt-2 inline-flex items-center gap-1 text-base">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      <span className="font-semibold text-slate-700">{candidate.scoreLabel}</span>
                      <span className="text-slate-500">({candidate.ratingCount})</span>
                    </div>

                    <p className="mt-4 text-base leading-7 text-slate-600">
                      <span className="font-semibold text-slate-700">Lời nhắn / Cover Letter:</span>{' '}
                      {candidate.message}
                    </p>
                  </div>
                </div>

                <div className="flex min-w-44 flex-col gap-2">
                  <button className="rounded-xl bg-green-500 px-4 py-2 text-lg font-semibold text-white hover:bg-green-600">
                    Chấp nhận
                  </button>
                  <button className="rounded-xl border border-slate-300 px-4 py-2 text-lg font-semibold text-slate-500 hover:bg-slate-50">
                    Từ chối
                  </button>

                  <button className="mt-2 inline-flex items-center gap-2 text-base text-green-500 hover:text-green-600">
                    <FileText className="h-4 w-4" />
                    Xem hồ sơ chi tiết
                  </button>
                  <button className="inline-flex items-center gap-2 text-base text-green-500 hover:text-green-600">
                    <MessageCircle className="h-4 w-4" />
                    Nhắn tin
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
