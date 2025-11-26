# 🔧 Inventory Management System - Backend
## 🔧 Etimad Mart – Backend (Node/Express)

Node.js + Express REST API for the Etimad Mart Inventory & Billing System. Provides authentication, RBAC, and all data endpoints used by the React frontend.

---

## 🧱 Tech Stack

- Node.js
- Express
- MongoDB + Mongoose
- JWT authentication
- Bcrypt for password hashing

---

## 🚀 Core Features (Backend)

- JWT‑based auth with roles: `superadmin`, `admin`, `manager`, `seller`
- Role‑based access control middleware
- Product, seller, customer, sale, bill, expense, return, and admin management
- Dashboard stats for admin and sellers
- Billing endpoints with stats and customer history
- **Returns endpoints** that adjust product stock when a return is recorded

---

## 📁 Project Structure

```text
backend/
├── app.js                 # Express app setup & route mounting
├── config/
│   └── database.js        # MongoDB connection
├── controllers/
│   ├── authController.js
│   ├── productController.js
│   ├── sellerController.js
│   ├── customerController.js
│   ├── saleController.js
│   ├── billController.js
│   ├── expenseController.js
│   ├── dashboardController.js
│   ├── returnController.js
│   └── adminController.js
├── middleware/
│   └── auth.js            # authenticate, authorizeManagerOrAdmin, authorizeAdmin, etc.
├── models/
│   ├── Admin.js
│   ├── Seller.js
│   ├── Customer.js
│   ├── Product.js
│   ├── Category.js
│   ├── Sale.js
│   ├── Bill.js
│   ├── Expense.js
│   ├── StockHistory.js
│   └── Return.js
├── routes/
│   ├── auth.js
│   ├── products.js
│   ├── sellers.js
│   ├── customers.js
│   ├── sales.js
│   ├── dashboard.js
│   ├── seller-dashboard.js
│   ├── pdf.js
│   ├── categories.js
│   ├── bills.js
│   ├── expenses.js
│   ├── admins.js
│   └── returns.js
└── package.json
```

`app.js` mounts routes under `/api/*` and applies global middleware (CORS, JSON body parsing, cookie parser, auth where required).

---

## 🔐 Auth & Roles

- **Auth flow**
  - `/api/auth/login` issues JWT
  - `authenticate` middleware validates token
  - Role helpers (`authorizeManagerOrAdmin`, `authorizeAdmin`, etc.) restrict access

- **Role examples**
  - Products routes: `authenticate` + `authorizeManagerOrAdmin`
    - Delete: additionally wrapped with `authorizeAdmin` so managers cannot delete products
  - Returns routes: `authenticate` + `authorizeManagerOrAdmin`

---

## 🌐 Main API Endpoints (Summary)

Base URL: `http://localhost:4000/api`

- **Auth** – `/auth`
  - `POST /login`, `POST /logout`, `GET /me`, `POST /forgot-password`, `PUT /reset-password/:token`, `PUT /change-password`

- **Products** – `/products`
  - `GET /` – list products
  - `GET /low-stock` – low‑stock list
  - `GET /:id` – product details
  - `POST /` – create product
  - `PUT /:id` – update product
  - `DELETE /:id` – delete product (**admin only**)
  - `GET /:id/stock-history` – stock movements
  - `POST /:id/add-stock` – add stock and record history

- **Sellers** – `/sellers`
  - CRUD + leaderboard and dashboard helpers

- **Customers** – `/customers`
  - CRUD for customers

- **Sales** – `/sales`
  - Sales records (if used by reporting)

- **Bills / Billing** – `/bills`
  - `GET /` – paginated bill list with filters (used by Billing History)
  - `GET /:id` – single bill
  - `POST /` – create bill
  - `PATCH /:id/status` – update status
  - `DELETE /:id` – delete
  - `GET /customer/:id/history` – customer billing history / remaining
  - `GET /stats/overview` – billing stats

- **Expenses** – `/expenses`
  - `GET /` – list (with date filters)
  - `POST /` – create expense
  - `GET /stats/overview` – expense stats

- **Returns** – `/returns`
  - `GET /` – list returns (with optional search)
  - `POST /` – create return and **increment product stock**

- **Admins** – `/admins`
  - `GET /` – list admins
  - `PUT /:id/role` – change admin role

- **Dashboard** – `/dashboard`
  - Overall stats and chart data for admin dashboard

- **Seller Dashboard** – `/seller-dashboard`
  - Stats and recent sales for logged‑in seller

---

## 🔁 Returns Logic (Important)

When `POST /api/returns` is called:

1. Payload includes `productId`, `quantity`, `unitPrice`, `trackingId`, optional `notes`, and `customerName`.
2. Controller validates data and finds the product.
3. Product `stock` is increased by `quantity` and saved.
4. A `Return` document is created linking product, quantity, unitPrice, trackingId, notes, customerName, and `createdBy`.

This is what powers the frontend Returns page and ensures stock stays consistent.

---

## ⚙️ Setup & Run (Backend Only)

### 1. Install

```bash
cd backend
npm install
```

### 2. Environment

Create `backend/.env` (example):

```env
PORT=4000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/inventory-management
JWT_SECRET=change_me
JWT_EXPIRE=7d
FRONTEND_URL=http://localhost:5173
```

Add email configuration here if you use password reset via email.

### 3. Run

```bash
npm run dev   # nodemon, if configured
# or
npm start
```

API will be available at `http://localhost:4000/api`.

---

## 🧩 Notes

- CORS is configured in `app.js` using `FRONTEND_URL`.
- Many routes are wrapped in `authenticate` and role‑checking middlewares.
- Product delete and certain admin actions are double‑protected (backend + frontend).
- Returns endpoint is idempotent per request; if called twice for the same real‑world return, stock will increase twice.


Modern REST API built with Node.js, Express, and MongoDB for managing inventory, sales, sellers, and customers.

---

## 🚀 Features

### **Authentication & Authorization**
- JWT-based authentication
- Role-based access control (Admin/Seller)
- Password hashing with bcrypt
- Secure password reset system with email
- Session management
- Nodemailer email integration

### **Core Modules**
- 📦 **Product Management** - CRUD operations, stock tracking, low stock alerts
- 👥 **Seller Management** - Commission tracking, performance metrics
- 🛒 **Sales Management** - Transaction records, commission calculation
- 👤 **Customer Management** - Customer database, purchase history
- 📊 **Dashboard Analytics** - Real-time stats and reports

### **Seller Features**
- Dedicated seller dashboard
- Sales history with commission tracking
- Password change system
- Real-time stats (sales, revenue, commission)

---

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

---

## 🛠️ Installation

### **1. Clone the repository**
```bash
git clone <repository-url>
cd IMSystem/backend
```

### **2. Install dependencies**
```bash
npm install
```

### **3. Environment Setup**

Create a `.env` file in the backend directory:

```env
# Server Configuration
PORT=4000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/inventory-management

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d

# Email Configuration (for password reset)
# See EMAIL_SETUP_GUIDE.md for detailed setup instructions
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password-here
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME=Inventory Management System

# Frontend URL (for CORS and email links)
FRONTEND_URL=http://localhost:5173
```

### **4. Start MongoDB**
```bash
# If using local MongoDB
mongod

# Or use MongoDB Atlas (cloud)
# Update MONGODB_URI in .env with Atlas connection string
```

### **5. Run the server**

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

Server will run on `http://localhost:4000`

---

## 📁 Project Structure

```
backend/
├── models/              # Mongoose schemas
│   ├── Admin.js         # Admin user model
│   ├── Seller.js        # Seller model with commission
│   ├── Customer.js      # Customer model
│   ├── Product.js       # Product model with stock
│   ├── Category.js      # Product categories
│   └── Sale.js          # Sales transactions
│
├── routes/              # API routes
│   ├── auth.js          # Authentication endpoints
│   ├── products.js      # Product CRUD
│   ├── sellers.js       # Seller management
│   ├── customers.js     # Customer management
│   ├── sales.js         # Sales tracking
│   ├── dashboard.js     # Admin analytics
│   └── seller-dashboard.js  # Seller portal
│
├── middleware/
│   └── auth.js          # JWT authentication
│
├── config/
│   └── db.js            # MongoDB connection
│
├── .env                 # Environment variables
├── app.js               # Express app setup
├── server.js            # Server entry point
└── package.json
```

---

## 🔐 API Endpoints

### **Authentication** (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/register` | Register new admin | No |
| POST | `/login` | Login (admin/seller) | No |
| POST | `/logout` | Logout user | Yes |
| GET | `/me` | Get current user | Yes |
| PUT | `/change-password` | Change password | Yes |
| POST | `/forgot-password` | Request password reset | No |
| POST | `/reset-password` | Reset password with token | No |

### **Products** (`/api/products`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get all products | Yes |
| GET | `/:id` | Get single product | Yes |
| POST | `/` | Create product | Yes (Admin) |
| PUT | `/:id` | Update product | Yes (Admin) |
| DELETE | `/:id` | Delete product | Yes (Admin) |
| GET | `/low-stock` | Get low stock products | Yes |

### **Sellers** (`/api/sellers`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get all sellers | Yes (Admin) |
| GET | `/:id` | Get single seller | Yes (Admin) |
| POST | `/` | Create seller | Yes (Admin) |
| PUT | `/:id` | Update seller | Yes (Admin) |
| DELETE | `/:id` | Delete seller | Yes (Admin) |
| PATCH | `/:id/toggle-status` | Activate/deactivate | Yes (Admin) |

### **Customers** (`/api/customers`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get all customers | Yes |
| GET | `/:id` | Get single customer | Yes |
| POST | `/` | Create customer | Yes |
| PUT | `/:id` | Update customer | Yes |
| DELETE | `/:id` | Delete customer | Yes |

### **Sales** (`/api/sales`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get all sales | Yes |
| GET | `/:id` | Get single sale | Yes |
| POST | `/` | Create sale | Yes |
| PUT | `/:id` | Update sale | Yes |
| DELETE | `/:id` | Delete sale | Yes |

### **Admin Dashboard** (`/api/dashboard`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/stats` | Get dashboard stats | Yes (Admin) |
| GET | `/revenue-chart` | Revenue chart data | Yes (Admin) |
| GET | `/recent-sales` | Recent sales list | Yes (Admin) |

### **Seller Dashboard** (`/api/seller-dashboard`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/stats` | Get seller stats | Yes (Seller) |
| GET | `/recent-sales` | Seller's sales history | Yes (Seller) |

---

## 🗄️ Database Models

### **Admin**
```javascript
{
  username: String (required, unique),
  email: String (required, unique),
  password: String (required, hashed),
  role: String (enum: ['admin', 'superadmin']),
  createdAt: Date,
  updatedAt: Date
}
```

### **Seller**
```javascript
{
  name: String (required),
  email: String (required, unique),
  password: String (required, hashed),
  phone: String (required),
  address: String,
  commissionRate: Number (default: 5),
  isActive: Boolean (default: true),
  createdAt: Date,
  updatedAt: Date
}
```

### **Product**
```javascript
{
  name: String (required),
  description: String,
  price: Number (required),
  stock: Number (required, default: 0),
  category: String,
  lowStockThreshold: Number (default: 10),
  createdAt: Date,
  updatedAt: Date
}
```

### **Customer**
```javascript
{
  name: String (required),
  email: String (required, unique),
  phone: String (required),
  address: String,
  createdAt: Date,
  updatedAt: Date
}
```

### **Sale**
```javascript
{
  productId: ObjectId (ref: Product),
  sellerId: ObjectId (ref: Seller),
  customerId: ObjectId (ref: Customer),
  productName: String,
  sellerName: String,
  customerName: String,
  quantity: Number (required),
  unitPrice: Number (required),
  total: Number (required),
  commission: Number (required),
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🔒 Security Features

### **Authentication**
- JWT tokens with 7-day expiration
- Bcrypt password hashing (10 rounds)
- HTTP-only cookies for token storage
- CORS configuration for frontend

### **Authorization**
- Role-based access control
- Protected routes with middleware
- Seller/Admin separation

### **Data Validation**
- Mongoose schema validation
- Input sanitization
- Error handling middleware

---

## 🧪 Testing

### **API Testing with Postman/Thunder Client**

**1. Register Admin:**
```http
POST http://localhost:4000/api/auth/register
Content-Type: application/json

{
  "username": "admin",
  "email": "admin@example.com",
  "password": "admin123"
}
```

**2. Login:**
```http
POST http://localhost:4000/api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "admin123"
}
```

**3. Create Product:**
```http
POST http://localhost:4000/api/products
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "name": "Laptop",
  "description": "Gaming laptop",
  "price": 80000,
  "stock": 10,
  "category": "Electronics"
}
```

---

## 🐛 Common Issues & Solutions

### **Issue 1: MongoDB Connection Error**
```
Error: MongoServerError: connect ECONNREFUSED
```
**Solution:** Make sure MongoDB is running
```bash
# Start MongoDB
mongod

# Or check MongoDB service status
sudo systemctl status mongod
```

### **Issue 2: Port Already in Use**
```
Error: listen EADDRINUSE: address already in use :::4000
```
**Solution:** Kill the process or change port
```bash
# Kill process on port 4000
npx kill-port 4000

# Or change PORT in .env
PORT=5000
```

### **Issue 3: JWT Secret Not Found**
```
Error: JWT_SECRET is not defined
```
**Solution:** Add JWT_SECRET to .env file
```env
JWT_SECRET=your-secret-key-here
```

---

## 📊 Performance Tips

### **Database Indexing**
```javascript
// Add indexes for frequently queried fields
productSchema.index({ name: 1 });
productSchema.index({ category: 1 });
saleSchema.index({ sellerId: 1, createdAt: -1 });
```

### **Pagination**
```javascript
// Use pagination for large datasets
const page = parseInt(req.query.page) || 1;
const limit = parseInt(req.query.limit) || 20;
const skip = (page - 1) * limit;

const products = await Product.find()
  .skip(skip)
  .limit(limit);
```

---

## 🚀 Deployment

### **Production Checklist**
- [ ] Set `NODE_ENV=production` in .env
- [ ] Use strong JWT_SECRET (32+ characters)
- [ ] Enable HTTPS
- [ ] Set secure cookie options
- [ ] Use MongoDB Atlas for database
- [ ] Enable MongoDB authentication
- [ ] Set up proper CORS origins
- [ ] Configure rate limiting
- [ ] Set up logging (Winston/Morgan)
- [ ] Enable compression

### **Deploy to Render/Railway/Heroku**

**1. Create `Procfile`:**
```
web: node server.js
```

**2. Set environment variables on platform**

**3. Deploy:**
```bash
git push heroku main
```

---

## 📝 Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | 4000 |
| `NODE_ENV` | Environment | No | development |
| `MONGODB_URI` | MongoDB connection string | Yes | - |
| `JWT_SECRET` | JWT signing secret | Yes | - |
| `JWT_EXPIRE` | Token expiration | No | 7d |
| `FRONTEND_URL` | Frontend URL for CORS | No | http://localhost:5173 |

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 👨‍💻 Developer Notes

### **Key Features Implemented:**

✅ JWT Authentication  
✅ Role-based Access Control  
✅ Password Reset System  
✅ Seller Dashboard with Commission Tracking  
✅ Sales History with Dates  
✅ Low Stock Notifications  
✅ Real-time Analytics  
✅ RESTful API Design  

### **Built With:**
- Node.js & Express.js
- MongoDB & Mongoose
- JWT for authentication
- Bcrypt for password hashing
- CORS for cross-origin requests

---

## 📞 Support

For issues or questions:
- Create an issue in the repository
- Contact: your-email@example.com

---

**Happy Coding! 🚀**
