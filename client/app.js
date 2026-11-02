const API = "/api";
let stories = [];
let activeCategory = "All";
let query = "";
let user = JSON.parse(localStorage.getItem("quillUser") || "null");
let token = localStorage.getItem("quillToken");
let editingId = null;
const $ = (selector) => document.querySelector(selector);

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
async function loadStories() {
  try {
    const params = new URLSearchParams();
    if (activeCategory !== "All") params.set("category", activeCategory);
    if (query) params.set("search", query);
    stories = (await request(`/posts?${params}`)).posts;
    render();
  } catch (error) { showToast(error.message); }
}
function storyMarkup(story, compact = false) {
  const ownerActions = user && story.author === user.name ? `<div class="story-actions"><button class="story-action edit-story">Edit</button><button class="story-action delete-story">Delete</button></div>` : "";
  return `<article class="${compact ? "list-story" : "story-card"}" data-story-id="${story.id}">
    <div class="story-visual ${story.visual} ${compact ? "list-visual" : ""}"><span class="visual-label">${story.label}</span></div>
    <div class="story-details"><div class="story-meta"><span>${story.category}</span><span class="read-time">${story.time}</span></div>
    <h3><a href="#" class="story-link">${story.title}</a></h3><p class="excerpt">${story.excerpt}</p>
    <div class="story-author"><span class="author-avatar">${story.initials}</span>${story.author}</div>${ownerActions}</div>
  </article>`;
}
function render() {
  $("#featuredGrid").innerHTML = stories.slice(0, 3).map((story) => storyMarkup(story)).join("") || `<p>No stories found. Try another topic.</p>`;
  $("#storyList").innerHTML = stories.map((story) => storyMarkup(story, true)).join("") || `<p>No stories found.</p>`;
  $("#storyCount").textContent = `${stories.length} ${stories.length === 1 ? "story" : "stories"}`;
  document.querySelectorAll(".story-link").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault(); openStory(Number(event.currentTarget.closest("[data-story-id]").dataset.storyId));
  }));
  document.querySelectorAll(".edit-story").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault(); const story = stories.find((item) => item.id === Number(event.currentTarget.closest("[data-story-id]").dataset.storyId)); openEditor(story);
  }));
  document.querySelectorAll(".delete-story").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    try { await request(`/posts/${event.currentTarget.closest("[data-story-id]").dataset.storyId}`, { method: "DELETE" }); await loadStories(); showToast("Your story was deleted."); }
    catch (error) { showToast(error.message); }
  }));
}
function openModal(id) { $(id).classList.add("open"); $(id).setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; }
function closeModals() { document.querySelectorAll(".modal-backdrop").forEach((modal) => { modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); }); document.body.style.overflow = ""; }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2800); }
async function openStory(id) {
  try {
    const { post, comments } = await request(`/posts/${id}`);
    $("#readContent").innerHTML = `<div class="eyebrow">${post.category} · ${post.time}</div><h2 id="readTitle">${post.title}</h2><div class="read-content-meta">By ${post.author}</div><div class="read-body">${post.body}</div><div class="comment-box"><h3>Join the conversation</h3><div class="comment-input"><input id="commentField" placeholder="${user ? "Share a thought..." : "Log in to comment"}" ${user ? "" : "disabled"} /><button class="button button-dark" id="commentButton" ${user ? "" : "disabled"}>Post</button></div><div class="comment-list">${comments.map((comment) => `<div class="comment"><strong>${comment.author}</strong>${comment.body}</div>`).join("")}</div></div>`;
    openModal("#readModal");
    $("#commentButton").addEventListener("click", async () => {
      const field = $("#commentField");
      if (!field.value.trim()) return;
      try { await request(`/posts/${id}/comments`, { method: "POST", body: JSON.stringify({ body: field.value }) }); await openStory(id); showToast("Your comment was posted."); }
      catch (error) { showToast(error.message); }
    });
  } catch (error) { showToast(error.message); }
}
function openEditor(story = null) {
  editingId = story?.id || null;
  $("#editorTitle").innerHTML = story ? "Refine your <em>story.</em>" : "What’s on your <em>mind?</em>";
  $("#postTitle").value = story?.title || ""; $("#postCategory").value = story?.category || "Mindset"; $("#postBody").value = story?.body || "";
  openModal("#editorModal");
}
function setAuthMode(mode) {
  const signup = mode === "signup";
  document.querySelectorAll(".auth-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.authMode === mode));
  $("#authTitle").innerHTML = signup ? "Make space for<br /><em>good ideas.</em>" : "Welcome<br /><em>back.</em>";
  $("#authIntro").textContent = signup ? "Create an account to join the conversation, save stories, and start writing." : "Log in to keep reading, writing, and connecting with the community.";
  $("#nameField").parentElement.style.display = signup ? "block" : "none"; $("#nameField").required = signup;
  $("#authSubmit").innerHTML = signup ? "Create my account <span>↗</span>" : "Log in <span>↗</span>";
}
function setSignedIn(nextUser, nextToken) {
  user = nextUser; token = nextToken; localStorage.setItem("quillUser", JSON.stringify(user)); localStorage.setItem("quillToken", token);
  $("#loginButton").classList.add("hidden"); $("#signupButton").classList.add("hidden"); $("#profileButton").classList.remove("hidden"); $("#profileButton").textContent = user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModals));
document.querySelectorAll(".modal-backdrop").forEach((backdrop) => backdrop.addEventListener("click", (event) => { if (event.target === backdrop) closeModals(); }));
document.querySelectorAll("[data-auth-mode]").forEach((tab) => tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode)));
$("#loginButton").addEventListener("click", () => { setAuthMode("login"); openModal("#authModal"); });
$("#signupButton").addEventListener("click", () => { setAuthMode("signup"); openModal("#authModal"); });
$("#heroStartButton").addEventListener("click", () => user ? openEditor() : openModal("#authModal"));
$("#joinButton").addEventListener("click", () => { setAuthMode("signup"); openModal("#authModal"); });
$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const signup = document.querySelector(".auth-tab.active").dataset.authMode === "signup";
  const payload = { email: $("#authForm input[type=email]").value, password: $("#authForm input[type=password]").value };
  if (signup) payload.name = $("#nameField").value;
  try { const result = await request(`/auth/${signup ? "register" : "login"}`, { method: "POST", body: JSON.stringify(payload) }); setSignedIn(result.user, result.token); closeModals(); await loadStories(); showToast(signup ? `Welcome to Quill & Co., ${user.name.split(" ")[0]}.` : `Welcome back, ${user.name.split(" ")[0]}.`); }
  catch (error) { showToast(error.message); }
});
$("#profileButton").addEventListener("click", () => openEditor());
$("#postForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = { title: $("#postTitle").value, body: $("#postBody").value, category: $("#postCategory").value };
  try { await request(editingId ? `/posts/${editingId}` : "/posts", { method: editingId ? "PUT" : "POST", body: JSON.stringify(payload) }); editingId = null; closeModals(); event.target.reset(); await loadStories(); showToast("Your story is live."); }
  catch (error) { showToast(error.message); }
});
document.querySelectorAll(".topic-chip").forEach((chip) => chip.addEventListener("click", () => { activeCategory = chip.dataset.category; document.querySelectorAll(".topic-chip").forEach((item) => item.classList.toggle("active", item === chip)); loadStories(); }));
$("#searchInput").addEventListener("input", (event) => { query = event.target.value; loadStories(); });
$("#mobileMenuButton").addEventListener("click", () => $("#desktopNav").classList.toggle("mobile-open"));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModals(); });
if (user && token) setSignedIn(user, token);
loadStories();
