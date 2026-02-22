import { useEffect, useMemo, useState } from "react";
import { Analytics } from "@vercel/analytics/react";

const STORAGE_KEY = "study-tracker-items-v1";



export default function App() {

  const API_BASE = import.meta.env.VITE_API_BASE;
  const API = `${API_BASE}/api/tasks?userId=${encodeURIComponent(userId)}`;

  const userId =
  localStorage.getItem("studytracker-user") ||
  (() => {
    const id = crypto.randomUUID();
    localStorage.setItem("studytracker-user", id);
    return id;
  })();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("all"); // all | active | done
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    let cancelled = false;
  
    async function boot() {
      setLoading(true);
      try {
        await loadTasks();
      } catch (err) {
        console.log("Backend likely sleeping, retrying once...", err);
        // wait 3 seconds then retry
        await new Promise((r) => setTimeout(r, 3000));
        try {
          await loadTasks();
        } catch (e2) {
          console.log("Still waking up. User can retry / add task.", e2);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
  
    boot();
    return () => { cancelled = true; };
  }, []);

  async function loadTasks() {
    const res = await fetch(`${API}?userId=${userId}`);
    if (!res.ok) throw new Error(`GET failed: ${res.status}`);
    const data = await res.json();
    setItems(data);
  }

  async function addItem(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed, done: false, userId }),
    });

    const created = await res.json();
    setText("");
    await loadTasks(); // pulls saved tasks (including old ones)
  }

  async function toggleDone(id) {
    const res = await fetch(`${API}/${id}`, { method: "PATCH" });
    const updated = await res.json();
  
    setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
  }

  async function removeItem(id) {
    await fetch(`${API}/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function editTask(id, newTask) {
    const trimmed = newTask.trim();
    if (!trimmed) return;
  
    const res = await fetch(`${API}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
  
    const updated = await res.json();
    setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
  }
  async function moveTask(id, direction) {
    setItems((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
  
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
  
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
  
      // Persist new order (fire-and-forget)
      fetch(`${API}/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: copy.map((t) => t.id) }),
      });
  
      return copy;
    });
  }


  const visibleItems = useMemo(() => {
    if (filter === "active") return items.filter((i) => !i.done);
    if (filter === "done") return items.filter((i) => i.done);
    return items;
  }, [items, filter]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", padding: 24}}>
      <div style={{ width: "min(720px, 100%)", border: "1px solid #eee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ margin: 0 }}>Study Session Tracker</h1>
        <p style={{ marginTop: 6, color: "#ffffff" }}>
          Add what you’re studying, check it off, and it’ll save automatically.
        </p>

        <form onSubmit={addItem} style={{ display: "flex", gap: 10 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g., Do math HW"
            style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }}
          />
          <button type="submit" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111", background: "#344b76", color: "white" }}>
            Add
          </button>
        </form>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={() => setFilter("all")}>All</button>
          <button onClick={() => setFilter("active")}>Active</button>
          <button onClick={() => setFilter("done")}>Done</button>
        </div>

        {loading ? (
          <p style={{ marginTop: 16, opacity: 0.8 }}>
            Waking up server, add a task after minute and reload the page! (Render free tier can take a minute to start-up after inactivity)
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, marginTop: 14 }}>
            {visibleItems.map((item) => (
              <li
                key={item.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: 10,
                  border: "1px solid #eee",
                  borderRadius: 12,
                  marginBottom: 10,
                }}
              >
                {/* LEFT SIDE: checkbox + title OR edit input */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleDone(item.id)}
                  />

                  {editingId === item.id ? (
                    <input
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                      }}
                      autoFocus
                    />
                  ) : (
                    <span
                      style={{
                        flex: 1,
                        textDecoration: item.done ? "line-through" : "none",
                      }}
                    >
                      {item.title}
                    </span>
                  )}
                </div>

                {/* RIGHT SIDE: controls */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => moveTask(item.id, -1)}>↑</button>
                  <button type="button" onClick={() => moveTask(item.id, 1)}>↓</button>

                  {editingId === item.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          editTask(item.id, editingText);
                          setEditingId(null);
                          setEditingText("");
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditingText("");
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditingText(item.title);
                      }}
                    >
                      Edit
                    </button>
                  )}

                  <button type="button" onClick={() => removeItem(item.id)}>✕</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Analytics />
    </div>
  );
}
