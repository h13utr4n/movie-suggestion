## 1. Dự Án Này Làm Gì?

Movie Suggestion là một web app gợi ý phim.

Người dùng có thể:

- xem danh sách phim;
- xem chi tiết phim;
- đăng ký, đăng nhập;
- chọn thể loại yêu thích;
- bình luận phim;
- chấm điểm phim 1-5 sao;
- nhận gợi ý phim dựa trên hành vi xem, đánh giá, và sở thích.

Admin có thể:

- quản lý phim;
- duyệt bình luận;
- sửa/xóa rating;
- xem thống kê;
- chạy các tác vụ bảo trì dữ liệu.

## 2. Công Nghệ Đang Dùng

Trong dự án này:

- Frontend dùng **React**.
- Giao diện dùng **TailwindCSS**.
- Backend dùng **Python + FastAPI**.
- Database dùng **MongoDB**.
- Movie data lấy từ **OMDb** và **TMDB**.

## 3. Cần Cài Gì Trên Máy?

Bạn cần cài:

1. **Git**
2. **Python 3.12+**
3. **Node.js 20+**
4. **VS Code**
5. **MongoDB connection string** 
6. **OMDb API key** và **TMDB API key** nếu cần seed/search data

## 4. Cấu Trúc Thư Mục

```text
MovieSuggestion/
  backend/              # Code Python FastAPI
    main.py             # File backend chính, có nhiều API
    models.py           # Kiểu dữ liệu: Movie, User, Rating...
    auth_service.py     # Đăng nhập, JWT, hash password
    omdb_service.py     # Gọi OMDb API
    tmdb_service.py     # Gọi TMDB API
    seed.py             # Nạp dữ liệu phim
    data_analysis.py    # Tổng hợp thống kê DB
    tests/              # Test backend

  frontend/             # Code React
    src/
      App.jsx           # Trang chính
      MovieDetail.jsx   # Trang chi tiết phim
      AdminPanel.jsx    # Trang admin
      Header.jsx        # Header
      config.js         # API base URL
```

Hãy đọc theo thứ tự:

1. `README.md`
2. `frontend/src/App.jsx`
3. `frontend/src/MovieDetail.jsx`
4. `backend/main.py`
5. `backend/models.py`

Không cần đọc hết `backend/main.py` một lần. File này dài, nên chỉ đọc phần mình cần sửa.

## 5. Cách Chạy Dự Án

### 5.1. Chạy Backend

Mở terminal tại thư mục gốc `MovieSuggestion`.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ..
.\backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Nếu chạy thành công, mở:

```text
http://127.0.0.1:8000
```

Hoặc thất bại thì có thể đổi --port.

Nếu thấy trang Swagger API là backend đã chạy.

### 5.2. Chạy Frontend

Mở terminal mới.

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5176
```

Mở trình duyệt:

```text
http://127.0.0.1:5176
```

Thất bại thì có thể đổi --port.

## 6. File `.env`

```env
MONGODB_URL=mongodb+srv://...
OMDB_API_KEY=...
TMDB_API_KEY=...
JWT_SECRET_KEY=...
ADMIN_EMAILS=admin@example.com
FRONTEND_URL=http://localhost:5176
```

Quy tắc quan trọng:

- Không đưa `.env` lên GitHub.

## 7. Các Chức Năng Chính Và Code Nằm Ở Đâu

### Movie List

Frontend:

- `frontend/src/App.jsx`

Backend:

- `GET /movies`
- Trong `backend/main.py`

Chức năng:

- lấy danh sách phim;
- phân trang;
- sắp xếp theo ngày phát hành.

### Movie Detail

Frontend:

- `frontend/src/MovieDetail.jsx`

Backend:

- `GET /movies/{imdb_id}`
- `GET /movies/{imdb_id}/reviews`
- `POST /movies/{imdb_id}/reviews`
- `POST /movies/{imdb_id}/ratings`
- `POST /watch-history/{movie_id}/visit`
- `PUT /watch-history/{movie_id}/time`

Chức năng:

- hiện chi tiết phim;
- hiện actor, award;
- bình luận;
- chấm sao;
- track hành vi xem.

### Auth

Frontend:

- form đăng nhập/đăng ký trong `App.jsx` và `MovieDetail.jsx`

Backend:

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `PUT /auth/me/favorite-genres`

Chức năng:

- đăng ký;
- đăng nhập;
- lưu token vào `localStorage`;
- cập nhật thể loại yêu thích.

### Recommendation

Backend:

- `GET /recommendations`
- Trong `backend/main.py`

Chức năng:

- gợi ý phim dựa trên thể loại yêu thích;
- hành vi xem;
- thời gian truy cập;
- rating cao/thấp;
- so sánh với user khác;
- chèn phim discovery để danh sách đa dạng hơn.

### Admin

Frontend:

- `frontend/src/AdminPanel.jsx`

Backend:

- các API bắt đầu bằng `/admin/...`

Chức năng:

- quản lý phim;
- duyệt bình luận;
- quản lý rating;
- xem thống kê;
- chạy trigger bảo trì.

## 8. Cách Làm Một Task Nhỏ

Khi nhận task, dùng quy trình này:

1. Đọc task thật kỹ.
2. Tìm file liên quan.
3. Chạy app trước khi sửa để biết hiện trạng.
4. Sửa ít nhất có thể.
5. Chạy test/build.
6. Mở app test bằng tay.
7. Ghi lại đã sửa gì.

Ví dụ task:

```text
Đổi text nút Search thành Tìm phim
```

Cách làm:

1. Search trong frontend:

```powershell
cd frontend
Select-String -Path .\src\*.jsx -Pattern "Search"
```

2. Tìm file có text.
3. Sửa text.
4. Chạy:

```powershell
npm run lint
npm run build
```

5. Mở web xem đúng chưa.

## 9. Các Lệnh Test Nên Nhớ

Backend:

```powershell
.\backend\.venv\Scripts\python.exe -m compileall backend -q
.\backend\.venv\Scripts\python.exe -m pytest backend\tests -q
```

Frontend:

```powershell
cd frontend
npm run lint
npm test
npm run build
```

Nếu test fail, đừng panic. Đọc dòng lỗi đầu tiên có tên file và số dòng.

Ví dụ:

```text
frontend/src/App.jsx:25
```

Nghĩa là lỗi ở file `App.jsx`, gần dòng 25.

## 10. Cách Đọc Lỗi

Khi gặp lỗi, hãy trả lời 4 câu hỏi:

1. Lỗi xảy ra khi chạy lệnh nào?
2. Lỗi ở file nào?
3. Lỗi ở dòng nào?
4. Trước đó mình vừa sửa gì?

Mẫu tin nhắn hỏi team:

```text
Em chạy npm run build thì bị lỗi ở frontend/src/MovieDetail.jsx dòng 80.
Trước đó em sửa phần watch-history sync time.
Log lỗi là:
...
Anh/chị xem giúp em hướng fix với.
```

## 11. Những Task Phù Hợp Cho Người Mới

Task frontend dễ bắt đầu:

- sửa text hiển thị;
- thêm loading/empty state;
- sửa layout nhỏ;
- thêm field thông tin phim vào UI;
- thêm nút quay lại;
- thêm validate form đơn giản;
- sửa màu/spacing theo UI hiện có.

Task backend dễ bắt đầu:

- thêm validate `limit`;
- thêm field vào response;
- thêm endpoint đọc data đơn giản;
- thêm test cho helper function;
- sửa message lỗi;
- thêm thống kê đơn giản trong admin summary.

## 12. Quy Tắc Code Trong Dự Án

- Sửa ít file nhất có thể.
- Không đổi format cả file nếu không cần.
- Không xóa code mình không hiểu.
- Không commit `.env`.
- Không hard-code secret/API key.
- Tên biến nên rõ nghĩa.
- Code xong phải chạy test/build.
- Nếu thấy file có thay đổi là của người khác, hỏi trước khi sửa mạnh.

## 13. Nên Học Thêm Gì?

1. JavaScript cơ bản
2. React component, state, props, `useEffect`
3. HTTP request với `fetch`
4. Python function, dict, list
5. FastAPI route
6. MongoDB document/query cơ bản
7. Git: status, diff, add, commit

Không cần học hết trước khi join. Mỗi task nhỏ sẽ giúp học dần.

## 14. Checklist Khi Vào Dự Án Lần Đầu

- [ ] Clone dự án về máy.
- [ ] Tạo được `backend/.env`.
- [ ] Cài Python dependencies.
- [ ] Chạy được backend.
- [ ] Mở được Swagger docs.
- [ ] Cài npm dependencies.
- [ ] Chạy được frontend.
- [ ] Đăng ký/đăng nhập thử.
- [ ] Mở được trang chi tiết phim.
- [ ] Chạy được backend tests.
- [ ] Chạy được frontend build.
- [ ] Nhận task nhỏ đầu tiên.

## 15. Task Đầu Tiên Gợi Ý

```text
Thêm một empty state đẹp hơn khi danh sách phim gợi ý rỗng.
```

Lý do:

- chỉ cần sửa frontend;
- không ảnh hưởng database;
- dễ test bằng mắt;
- giúp làm quen React component.

File có khả năng cần sửa:

```text
frontend/src/App.jsx
```

