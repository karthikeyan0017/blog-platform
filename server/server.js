const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "quill-co-local-development-secret";
const db = new Database(path.join(__dirname, "blog.sqlite"));

app.use(cors());
app.use(express.json({ limit: "50kb" }));
app.use(express.static(path.join(__dirname, "..", "client")));

db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    body TEXT NOT NULL,
    post_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const seedUser = db.prepare("SELECT id FROM users WHERE email = ?").get("maya@quill.co");
if (!seedUser) {
  const insertUser = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)");
  const userId = insertUser.run("Maya Chen", "maya@quill.co", bcrypt.hashSync("password123", 10)).lastInsertRowid;
  const insertPost = db.prepare("INSERT INTO posts (title, body, category, author_id) VALUES (?, ?, ?, ?)");
  const seedPosts = [
    ["The art of paying attention", "Attention is not something we find; it is something we practice.\n\nIn a world designed to pull us in a dozen directions at once, choosing what to notice is a quiet act of self-respect. It is the difference between moving through a day and actually being there for it.\n\nTry this: for five minutes today, put your phone in another room and give one ordinary thing your complete attention.", "Mindset"],
    ["Notes on making things", "The first draft is not supposed to be good. It is supposed to exist.\n\nMost of the work happens in the unremarkable middle: showing up, making a mess, noticing what has potential, and returning the next day.", "Creativity"],
    ["A field guide to being new", "Being new asks us to become a beginner again. It can feel like a loss of competence, but it is also a return to curiosity.\n\nThere is a particular kind of freedom in not yet knowing the rules. Ask questions. Take the long way home.", "Culture"],
  ];
  for (const post of seedPosts) insertPost.run(...post, userId);
  const firstPost = db.prepare("SELECT id FROM posts ORDER BY id LIMIT 1").get();
  db.prepare("INSERT INTO comments (body, post_id, author_id) VALUES (?, ?, ?)").run("This gave me a new way to think about my morning.", firstPost.id, userId);
}

function tokenFor(user) {
  return jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}
function auth(required = true) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    try {
      if (!header.startsWith("Bearer ")) throw new Error("Missing token");
      req.user = jwt.verify(header.slice(7), JWT_SECRET);
      next();
    } catch (error) {
      if (required) return res.status(401).json({ error: "Authentication required." });
      next();
    }
  };
}
function postView(post) {
  const initials = post.author.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return { ...post, initials, time: "5 min read", excerpt: post.body.replace(/\s+/g, " ").slice(0, 115) + (post.body.length > 115 ? "..." : ""), visual: `visual-${post.id % 3 === 0 ? "green" : post.id % 2 === 0 ? "blue" : "orange"}`, label: post.category };
}

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password || password.length < 8) return res.status(400).json({ error: "Name, email, and a password of at least 8 characters are required." });
  try {
    const result = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)").run(name.trim(), email.trim(), bcrypt.hashSync(password, 10));
    const user = { id: Number(result.lastInsertRowid), name: name.trim(), email: email.trim() };
    return res.status(201).json({ user, token: tokenFor(user) });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "An account with that email already exists." });
    return res.status(500).json({ error: "Unable to create account." });
  }
});
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT id, name, email, password_hash FROM users WHERE email = ?").get(email?.trim());
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) return res.status(401).json({ error: "Invalid email or password." });
  const safeUser = { id: user.id, name: user.name, email: user.email };
  res.json({ user: safeUser, token: tokenFor(safeUser) });
});
app.get("/api/me", auth(), (req, res) => res.json({ user: req.user }));

app.get("/api/posts", (req, res) => {
  const { category, search } = req.query;
  let sql = `SELECT posts.*, users.name AS author FROM posts JOIN users ON users.id = posts.author_id WHERE 1 = 1`;
  const params = [];
  if (category && category !== "All") { sql += " AND posts.category = ?"; params.push(category); }
  if (search) { sql += " AND (posts.title LIKE ? OR posts.body LIKE ? OR users.name LIKE ?)"; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  sql += " ORDER BY posts.created_at DESC";
  res.json({ posts: db.prepare(sql).all(...params).map(postView) });
});
app.get("/api/posts/:id", (req, res) => {
  const post = db.prepare("SELECT posts.*, users.name AS author FROM posts JOIN users ON users.id = posts.author_id WHERE posts.id = ?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "Story not found." });
  const comments = db.prepare("SELECT comments.id, comments.body, comments.created_at, users.name AS author FROM comments JOIN users ON users.id = comments.author_id WHERE comments.post_id = ? ORDER BY comments.created_at ASC").all(req.params.id);
  res.json({ post: postView(post), comments });
});
app.post("/api/posts", auth(), (req, res) => {
  const { title, body, category } = req.body;
  if (!title?.trim() || !body?.trim() || !category?.trim()) return res.status(400).json({ error: "Title, topic, and story body are required." });
  const result = db.prepare("INSERT INTO posts (title, body, category, author_id) VALUES (?, ?, ?, ?)").run(title.trim(), body.trim(), category.trim(), req.user.id);
  const post = db.prepare("SELECT posts.*, users.name AS author FROM posts JOIN users ON users.id = posts.author_id WHERE posts.id = ?").get(result.lastInsertRowid);
  res.status(201).json({ post: postView(post) });
});
app.put("/api/posts/:id", auth(), (req, res) => {
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "Story not found." });
  if (post.author_id !== req.user.id) return res.status(403).json({ error: "You can only edit your own stories." });
  const { title, body, category } = req.body;
  if (!title?.trim() || !body?.trim() || !category?.trim()) return res.status(400).json({ error: "Title, topic, and story body are required." });
  db.prepare("UPDATE posts SET title = ?, body = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(title.trim(), body.trim(), category.trim(), req.params.id);
  const updated = db.prepare("SELECT posts.*, users.name AS author FROM posts JOIN users ON users.id = posts.author_id WHERE posts.id = ?").get(req.params.id);
  res.json({ post: postView(updated) });
});
app.delete("/api/posts/:id", auth(), (req, res) => {
  const result = db.prepare("DELETE FROM posts WHERE id = ? AND author_id = ?").run(req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: "Story not found or you do not own it." });
  res.status(204).end();
});
app.post("/api/posts/:id/comments", auth(), (req, res) => {
  if (!req.body.body?.trim()) return res.status(400).json({ error: "Comment cannot be empty." });
  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "Story not found." });
  const result = db.prepare("INSERT INTO comments (body, post_id, author_id) VALUES (?, ?, ?)").run(req.body.body.trim(), req.params.id, req.user.id);
  const comment = db.prepare("SELECT comments.id, comments.body, comments.created_at, users.name AS author FROM comments JOIN users ON users.id = comments.author_id WHERE comments.id = ?").get(result.lastInsertRowid);
  res.status(201).json({ comment });
});

app.listen(PORT, () => console.log(`Quill & Co. running at http://localhost:${PORT}`));
