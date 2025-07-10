# Split Generator – Backend

Split Generator is a full-stack web app for splitting grocery bills and group expenses. The backend provides secure APIs for user authentication, bill management, OCR processing, analytics, notifications, and premium features. Built with Node.js, Express, Prisma, and PostgreSQL (Supabase).

---

## 🚀 Backend Features
- **User Authentication**: Email/password login, Google OAuth
- **Bill Management**: Create, update, delete, and list bills (user-specific)
- **Product & Participant Management**: Assign products, calculate totals
- **Templates**: Save/reuse participant groups
- **Analytics**: Premium users get spending charts, top participants, and more
- **Premium**: Stripe-powered subscriptions, usage limits, upgrades
- **Notifications**: Email notifications for events, user preferences
- **OCR Processing**: Extract text/products from images (Tesseract.js)
- **API Security**: JWT auth, user-specific data isolation

---

## 🛠️ Tech Stack
- **Node.js** (Express)
- **Prisma** (ORM)
- **PostgreSQL** (Supabase)
- **Stripe** (subscriptions)
- **Nodemailer** (email)
- **Tesseract.js** (OCR)
- **Multer** (uploads)

---

## ⚡ Getting Started

### 1. Install dependencies
```bash
cd server
npm install
```

### 2. Configure environment
Create a `.env` file in the `server` folder:
```
PORT=5000
DATABASE_URL=postgresql://...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
FRONTEND_URL=http://localhost:3000
```

### 3. Run migrations
```bash
npx prisma migrate deploy
```

### 4. Start the backend
```bash
npm run dev
```

---

## 📝 API Overview (Highlights)
- `POST /api/auth/register` – Register
- `POST /api/auth/login` – Login
- `GET /api/bills` – List bills
- `POST /api/bills` – Create bill
- `GET /api/analytics/overview` – Analytics (premium)
- `GET /api/notifications/preferences` – Get notification prefs
- `PUT /api/notifications/preferences` – Update notification prefs
- `POST /api/premium/upgrade` – Upgrade to premium
- `POST /api/upload/image` – Upload receipt

---

## 🗄️ Database
- **Prisma schema** in `prisma/schema.prisma`
- Managed by Prisma migrations
- Uses Supabase/Postgres in production

---

## 🏗️ Project Structure
- `index.js` – Main server entry point
- `prisma/` – Prisma schema and migrations
- `routes/` – Express route handlers
- `middleware/` – Auth middleware
- `services/` – Business logic (premium, notifications, etc.)
- `uploads/` – Uploaded images

---

## 🤝 Contributing
Pull requests and suggestions are welcome!

---

## 📄 License
MIT License. See main repo for details. 