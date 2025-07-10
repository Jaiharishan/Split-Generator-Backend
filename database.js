const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT,
          name TEXT NOT NULL,
          avatar_url TEXT,
          provider TEXT DEFAULT 'local',
          provider_id TEXT,
          email_verified BOOLEAN DEFAULT FALSE,
          subscription_status TEXT DEFAULT 'free',
          subscription_plan TEXT DEFAULT 'free',
          subscription_expires_at DATETIME,
          stripe_customer_id TEXT,
          stripe_subscription_id TEXT,
          bills_created_this_month INTEGER DEFAULT 0,
          bills_limit INTEGER DEFAULT 3,
          participants_limit INTEGER DEFAULT 5,
          templates_limit INTEGER DEFAULT 2,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create user sessions table
      db.run(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token TEXT UNIQUE NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create bills table with user_id
      db.run(`
        CREATE TABLE IF NOT EXISTS bills (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          total_amount REAL NOT NULL,
          description TEXT,
          image_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create participants table
      db.run(`
        CREATE TABLE IF NOT EXISTS participants (
          id TEXT PRIMARY KEY,
          bill_id TEXT NOT NULL,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE CASCADE
        )
      `);

      // Create products table
      db.run(`
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          bill_id TEXT NOT NULL,
          name TEXT NOT NULL,
          price REAL NOT NULL,
          quantity INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE CASCADE
        )
      `);

      // Create product_participants junction table
      db.run(`
        CREATE TABLE IF NOT EXISTS product_participants (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          participant_id TEXT NOT NULL,
          share_percentage REAL DEFAULT 100,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
          FOREIGN KEY (participant_id) REFERENCES participants (id) ON DELETE CASCADE,
          UNIQUE(product_id, participant_id)
        )
      `);

      // Create bill_templates table
      db.run(`
        CREATE TABLE IF NOT EXISTS bill_templates (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create template_participants table
      db.run(`
        CREATE TABLE IF NOT EXISTS template_participants (
          id TEXT PRIMARY KEY,
          template_id TEXT NOT NULL,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (template_id) REFERENCES bill_templates (id) ON DELETE CASCADE
        )
      `);

      // Create indexes for better performance
      db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)');
      db.run('CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users (provider, provider_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions (token)');
      db.run('CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions (expires_at)');
      db.run('CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills (user_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_bills_created_at ON bills (created_at)');
      db.run('CREATE INDEX IF NOT EXISTS idx_participants_bill_id ON participants (bill_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_products_bill_id ON products (bill_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_product_participants_product_id ON product_participants (product_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_product_participants_participant_id ON product_participants (participant_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_bill_templates_user_id ON bill_templates (user_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_template_participants_template_id ON template_participants (template_id)');

      // Add user_id column to bills table if it doesn't exist (migration)
      db.run('ALTER TABLE bills ADD COLUMN user_id TEXT', (err) => {
        // Ignore error if column already exists
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration warning:', err.message);
        }
      });

      // Add description column to bills table if it doesn't exist (migration)
      db.run('ALTER TABLE bills ADD COLUMN description TEXT', (err) => {
        // Ignore error if column already exists
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration warning:', err.message);
        }
      });

      // Add premium subscription fields to users table (migration)
      db.run('ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT "free"', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration warning:', err.message);
        }
      });

      db.run('ALTER TABLE users ADD COLUMN subscription_plan TEXT DEFAULT "free"', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration warning:', err.message);
        }
      });

      db.run('ALTER TABLE users ADD COLUMN subscription_expires_at DATETIME', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration warning:', err.message);
        }
      });

      db.run('ALTER TABLE users ADD COLUMN stripe_customer_id TEXT', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration warning:', err.message);
        }
      });

      db.run('ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration warning:', err.message);
        }
      });

      // Add notification preferences (migration)
      db.run('ALTER TABLE users ADD COLUMN email_notifications BOOLEAN DEFAULT TRUE', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration warning:', err.message);
        }
      });

      db.run('ALTER TABLE users ADD COLUMN notification_preferences TEXT DEFAULT "{}"', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration warning:', err.message);
        }
      });

      db.run('ALTER TABLE users ADD COLUMN bills_created_this_month INTEGER DEFAULT 0', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration warning:', err.message);
        }
      });

      db.run('ALTER TABLE users ADD COLUMN bills_limit INTEGER DEFAULT 3', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration warning:', err.message);
        }
      });

      db.run('ALTER TABLE users ADD COLUMN participants_limit INTEGER DEFAULT 5', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration warning:', err.message);
        }
      });

      db.run('ALTER TABLE users ADD COLUMN templates_limit INTEGER DEFAULT 2', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration warning:', err.message);
        }
      });

      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

// Helper functions for database operations
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

module.exports = {
  db,
  initializeDatabase,
  runQuery,
  getQuery,
  allQuery
}; 