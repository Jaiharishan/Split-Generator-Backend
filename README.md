# Split Generator – Backend

Split Generator is a full-stack web app for splitting grocery bills and group expenses. The backend provides secure APIs for user authentication, bill management, OCR processing, and data persistence. It is built with Node.js, Express, SQLite, and integrates Tesseract.js for OCR.

---

## 🌟 Product Overview

**Split Generator** helps users split grocery and group bills by uploading e-bills or receipt images, extracting products, and assigning costs to participants. The backend powers all core logic, authentication, and data storage.

---

## 🚀 Backend Features

- **User Authentication**: Email/password login, Google OAuth, session management
- **Bill Management**: Create, update, delete, and list bills (user-specific)
- **Product & Participant Management**: Store products, assign to participants, calculate totals
- **Templates**: Save and reuse participant groups for quick bill creation
- **Bill Export**: Generate downloadable bill summaries
- **OCR Processing**: Extract text and products from uploaded images and PDFs using Tesseract.js and PDF.js
- **API Security**: Auth middleware, user-specific data isolation

---

## 🛠️ Tech Stack

- **Node.js** (Express server)
- **SQLite** (persistent database)
- **Tesseract.js** (OCR for images)
- **PDF.js** (PDF parsing)
- **Passport.js** (authentication, Google OAuth)
- **Multer** (file uploads)
- **CORS** (secure cross-origin requests)

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
SESSION_SECRET=your_secret_here
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
```

### 3. Start the backend
```bash
npm start
```
The server will run at [http://localhost:5000](http://localhost:5000)

---

## 🔑 Authentication
- Register/login with email & password
- Google OAuth login supported
- Sessions managed with secure cookies
- All bill data is user-specific

---

## 🧾 API Overview

- `POST /api/auth/register` – Register new user
- `POST /api/auth/login` – Login
- `GET /api/auth/google` – Google OAuth login
- `GET /api/bills` – List user bills
- `POST /api/bills` – Create new bill
- `GET /api/bills/:id` – Get bill details
- `PUT /api/bills/:id` – Update bill
- `DELETE /api/bills/:id` – Delete bill
- `POST /api/ocr` – Process uploaded receipt (image/PDF)
- `GET /api/templates` – List templates
- `POST /api/templates` – Create template
- `POST /api/bills/:id/export` – Export bill summary

All routes (except `/auth/*`) require authentication.

---

## 🗂️ Project Structure
- `index.js` – Main server entry point
- `db.js` – SQLite database setup
- `routes/` – Express route handlers (auth, bills, ocr, templates, export)
- `middleware/` – Auth and session middleware
- `ocr/` – OCR and parsing utilities

---

## 🔗 Frontend Integration
- The backend serves as the API for the React frontend (see `client/README.md`)
- CORS is enabled for local development
- All authentication and session cookies are HTTP-only for security

---

## 🤝 Contributing
Pull requests and suggestions are welcome! Please open an issue for major changes.

---

## 📄 License
MIT License. See main repo for details.

---

## 💡 About
Split Generator backend is designed for reliability, security, and easy integration with modern web frontends. Built to make group expense splitting seamless and accurate. 